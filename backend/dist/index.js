"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Fix BigInt serialization — Prisma returns BigInt for `clicks` but
// JSON.stringify() throws "Do not know how to serialize a BigInt" without this.
BigInt.prototype.toJSON = function toJSON() {
    return this.toString();
};
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const csurf_1 = __importDefault(require("csurf"));
const uuid_1 = require("uuid");
const config_1 = require("./config");
const db_1 = __importDefault(require("./db"));
const redis_1 = __importDefault(require("./redis"));
const logger_1 = __importDefault(require("./utils/logger"));
const url_service_1 = require("./services/url.service");
const metrics_1 = require("./middleware/metrics");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const url_routes_1 = __importDefault(require("./routes/url.routes"));
const redirect_routes_1 = __importDefault(require("./routes/redirect.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
(0, config_1.validateConfig)();
const app = (0, express_1.default)();
let isShuttingDown = false;
// Reject new requests during graceful shutdown
app.use((_req, res, next) => {
    if (isShuttingDown) {
        res.status(503).json({ error: 'Server shutting down' });
        return;
    }
    next();
});
app.use((0, helmet_1.default)({
    // Allow inline scripts for the password form
    contentSecurityPolicy: {
        directives: {
            ...helmet_1.default.contentSecurityPolicy.getDefaultDirectives(),
            'script-src': ["'self'", "'unsafe-inline'"],
        },
    },
}));
app.set('trust proxy', 1);
// Cache CORS middleware instance
const corsMiddleware = (0, cors_1.default)({
    origin: config_1.config.corsOrigin,
    credentials: true,
});
app.use(corsMiddleware);
app.use(express_1.default.json({ limit: '100kb' }));
app.use((0, cookie_parser_1.default)());
const csrfProtection = (0, csurf_1.default)({ cookie: true });
app.use(csrfProtection);
// Request ID middleware
app.use((req, res, next) => {
    const requestId = (0, uuid_1.v4)();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
});
// Prometheus metrics middleware
app.use(metrics_1.metricsMiddleware);
// Structured request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        logger_1.default.debug({
            requestId: req.requestId,
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: Date.now() - start,
        });
    });
    next();
});
// Metrics endpoint
app.get('/metrics', metrics_1.metricsEndpoint);
// Health check
app.get('/health', async (_req, res) => {
    if (isShuttingDown) {
        res.status(503).json({ status: 'shutting down' });
        return;
    }
    const checks = {};
    let healthy = true;
    try {
        await redis_1.default.ping();
        checks.redis = 'ok';
    }
    catch {
        checks.redis = 'down';
        healthy = false;
    }
    try {
        await db_1.default.$queryRaw `SELECT 1`;
        checks.database = 'ok';
    }
    catch {
        checks.database = 'down';
        healthy = false;
    }
    if (!healthy) {
        res.status(503).json({ status: 'degraded', checks });
        return;
    }
    res.json({ status: 'ok', timestamp: new Date().toISOString(), checks });
});
// CSRF token endpoint
app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});
// API docs — serve OpenAPI spec as JSON
app.get('/api/docs.json', (_req, res) => {
    res.json(openApiSpec);
});
// Swagger UI (CDN-loaded, no extra package needed)
app.get('/api/docs', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>URL Shortener API Docs</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" >
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
SwaggerUIBundle({
  url: '/api/docs.json',
  dom_id: '#swagger-ui',
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
  layout: 'BaseLayout',
  deepLinking: true
});
</script>
</body>
</html>`);
});
// Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api', url_routes_1.default);
app.use('/', redirect_routes_1.default);
// Global error handler
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        res.status(403).json({ error: 'Invalid or missing CSRF token' });
        return;
    }
    next(err);
});
app.use((err, req, res, _next) => {
    logger_1.default.error({ err, requestId: req.requestId }, 'Unhandled error');
    metrics_1.errorTotal.inc({ type: 'unhandled' });
    res.status(500).json({ error: 'Internal server error' });
});
// Distributed lock helpers
async function acquireDistributedLock(name, ttl = 30) {
    const value = (0, uuid_1.v4)();
    try {
        const result = await redis_1.default.set(`lock:${name}`, value, 'EX', ttl, 'NX');
        return result === 'OK' ? value : null;
    }
    catch {
        return null;
    }
}
async function releaseDistributedLock(name, expectedValue) {
    const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
    try {
        await redis_1.default.eval(script, 1, `lock:${name}`, expectedValue);
    }
    catch {
        // Best-effort release
    }
}
// Cleanup expired URLs
const cleanupInterval = setInterval(async () => {
    const lockValue = await acquireDistributedLock('cleanup-expired', 60);
    if (!lockValue)
        return;
    try {
        const result = await db_1.default.uRL.updateMany({
            where: {
                expiresAt: { lte: new Date() },
                isActive: true,
            },
            data: { isActive: false },
        });
        if (result.count > 0) {
            logger_1.default.info('Expired %d URLs', result.count);
        }
    }
    catch (err) {
        logger_1.default.error({ err }, 'Expired URL cleanup failed');
    }
    finally {
        await releaseDistributedLock('cleanup-expired', lockValue);
    }
}, 60 * 60 * 1000);
cleanupInterval.unref();
// Flush buffered clicks
const clickFlushInterval = setInterval(async () => {
    const lockValue = await acquireDistributedLock('flush-clicks', 15);
    if (!lockValue)
        return;
    try {
        const flushed = await url_service_1.urlService.flushClickQueue();
        if (flushed > 0) {
            logger_1.default.info('Flushed %d buffered clicks', flushed);
        }
    }
    catch (err) {
        logger_1.default.error({ err }, 'Failed to flush click queue');
    }
    finally {
        await releaseDistributedLock('flush-clicks', lockValue);
    }
}, 10000);
clickFlushInterval.unref();
const server = app.listen(config_1.config.port, () => {
    logger_1.default.info('URL Shortener API running on port %d', config_1.config.port);
});
// Hydrate bloom filter
url_service_1.urlService.hydrateBloomFilter().catch((err) => {
    logger_1.default.error({ err }, 'Failed to hydrate bloom filter');
});
const GRACEFUL_SHUTDOWN_TIMEOUT = 10000;
async function shutdown(signal) {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    logger_1.default.info('Received %s. Starting graceful shutdown...', signal);
    const forceExit = setTimeout(() => {
        logger_1.default.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT);
    forceExit.unref();
    server.close(() => {
        logger_1.default.info('HTTP server closed.');
    });
    clearInterval(cleanupInterval);
    clearInterval(clickFlushInterval);
    try {
        await db_1.default.$disconnect();
        logger_1.default.info('Database disconnected.');
    }
    catch (err) {
        logger_1.default.error({ err }, 'Error disconnecting database');
    }
    try {
        await redis_1.default.quit();
        logger_1.default.info('Redis disconnected.');
    }
    catch (err) {
        logger_1.default.error({ err }, 'Error disconnecting Redis');
    }
    clearTimeout(forceExit);
    logger_1.default.info('Graceful shutdown complete.');
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    logger_1.default.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
    logger_1.default.error({ err }, 'Uncaught exception');
    process.exit(1);
});
// ─── OpenAPI Specification ────────────────────────────────────────────────
const openApiSpec = {
    openapi: '3.0.0',
    info: {
        title: 'URL Shortener API',
        version: '1.0.0',
        description: 'Production-grade URL shortening service with analytics, QR codes, password protection, and admin management.',
    },
    servers: [{ url: '/api', description: 'API base' }],
    components: {
        securitySchemes: {
            cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' },
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        schemas: {
            User: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    email: { type: 'string', format: 'email' },
                    username: { type: 'string' },
                    role: { type: 'string', enum: ['USER', 'ADMIN'] },
                },
            },
            ShortUrl: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    shortCode: { type: 'string' },
                    shortUrl: { type: 'string' },
                    longUrl: { type: 'string', format: 'uri' },
                    title: { type: 'string', nullable: true },
                    tags: { type: 'array', items: { type: 'string' } },
                    clicks: { type: 'integer' },
                    isActive: { type: 'boolean' },
                    isOneTime: { type: 'boolean' },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                },
            },
            Error: {
                type: 'object',
                properties: {
                    error: { type: 'string' },
                    code: { type: 'string' },
                },
            },
        },
    },
    paths: {
        '/auth/register': {
            post: {
                tags: ['Auth'],
                summary: 'Register a new user',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'username', 'password'],
                                properties: {
                                    email: { type: 'string', format: 'email' },
                                    username: { type: 'string', minLength: 3, maxLength: 50 },
                                    password: { type: 'string', minLength: 8 },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: 'User registered successfully' },
                    400: { description: 'Validation error' },
                    409: { description: 'Email or username already taken' },
                },
            },
        },
        '/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Login with email and password',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'password'],
                                properties: {
                                    email: { type: 'string', format: 'email' },
                                    password: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Login successful' },
                    401: { description: 'Invalid credentials' },
                },
            },
        },
        '/auth/logout': {
            post: {
                tags: ['Auth'],
                summary: 'Logout (blacklists JWT)',
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: 'Logged out' } },
            },
        },
        '/auth/me': {
            get: {
                tags: ['Auth'],
                summary: 'Get current authenticated user',
                security: [{ cookieAuth: [] }],
                responses: {
                    200: { description: 'Current user info' },
                    401: { description: 'Not authenticated' },
                },
            },
        },
        '/shorten': {
            post: {
                tags: ['URLs'],
                summary: 'Create a short URL',
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['longUrl'],
                                properties: {
                                    longUrl: { type: 'string', format: 'uri' },
                                    customAlias: { type: 'string', minLength: 3, maxLength: 50 },
                                    expiresInDays: { type: 'integer', minimum: 1, maximum: 3650 },
                                    title: { type: 'string', maxLength: 500 },
                                    tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
                                    password: { type: 'string', maxLength: 100 },
                                    maxClicks: { type: 'integer', minimum: 1 },
                                    isOneTime: { type: 'boolean' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: 'Short URL created', content: { 'application/json': { schema: { $ref: '#/components/schemas/ShortUrl' } } } },
                    400: { description: 'Validation error or invalid URL' },
                    429: { description: 'Rate limit exceeded' },
                },
            },
        },
        '/urls': {
            get: {
                tags: ['URLs'],
                summary: 'Get current user\'s URLs',
                security: [{ cookieAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
                    { name: 'search', in: 'query', schema: { type: 'string' } },
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'all'] } },
                    { name: 'sort', in: 'query', schema: { type: 'string', enum: ['createdAt', 'clicks', 'expiresAt'] } },
                    { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
                ],
                responses: { 200: { description: 'Paginated URL list' } },
            },
        },
        '/urls/export': {
            get: {
                tags: ['URLs'],
                summary: 'Export user\'s URLs as CSV',
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: 'CSV file download', content: { 'text/csv': {} } } },
            },
        },
        '/urls/{id}': {
            patch: {
                tags: ['URLs'],
                summary: 'Update a URL',
                security: [{ cookieAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Updated URL' }, 404: { description: 'Not found' } },
            },
            delete: {
                tags: ['URLs'],
                summary: 'Delete a URL',
                security: [{ cookieAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 204: { description: 'Deleted' }, 404: { description: 'Not found' } },
            },
        },
        '/analytics/{shortCode}': {
            get: {
                tags: ['Analytics'],
                summary: 'Get URL analytics',
                security: [{ cookieAuth: [] }],
                parameters: [{ name: 'shortCode', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Analytics data' }, 404: { description: 'Not found' } },
            },
        },
        '/qr/{shortCode}': {
            get: {
                tags: ['QR Codes'],
                summary: 'Generate a QR code PNG for a short URL',
                parameters: [
                    { name: 'shortCode', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'size', in: 'query', schema: { type: 'integer', default: 300, minimum: 100, maximum: 1000 } },
                    { name: 'dark', in: 'query', schema: { type: 'string', default: '#000000' } },
                    { name: 'light', in: 'query', schema: { type: 'string', default: '#ffffff' } },
                ],
                responses: { 200: { description: 'QR code PNG image', content: { 'image/png': {} } } },
            },
        },
        '/admin/stats': {
            get: {
                tags: ['Admin'],
                summary: 'Get system statistics',
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: 'System stats' }, 403: { description: 'Admin only' } },
            },
        },
        '/admin/users': {
            get: {
                tags: ['Admin'],
                summary: 'List all users',
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: 'User list' } },
            },
        },
        '/admin/urls': {
            get: {
                tags: ['Admin'],
                summary: 'List all URLs',
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: 'URL list' } },
            },
        },
    },
};
exports.default = app;
//# sourceMappingURL=index.js.map