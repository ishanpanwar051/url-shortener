"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = exports.errorTotal = exports.redisOperationDuration = exports.dbQueryDuration = exports.cacheMissTotal = exports.cacheHitTotal = exports.redirectTotal = exports.urlCreatedTotal = void 0;
exports.metricsMiddleware = metricsMiddleware;
exports.metricsEndpoint = metricsEndpoint;
const prom_client_1 = __importDefault(require("prom-client"));
// Register default metrics (Node.js event loop, memory, GC, etc.)
const register = new prom_client_1.default.Registry();
exports.register = register;
prom_client_1.default.collectDefaultMetrics({ register, prefix: 'url_shortener_' });
// HTTP request duration histogram
const httpRequestDuration = new prom_client_1.default.Histogram({
    name: 'url_shortener_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
});
// HTTP request counter
const httpRequestTotal = new prom_client_1.default.Counter({
    name: 'url_shortener_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
});
// Active requests gauge
const activeRequests = new prom_client_1.default.Gauge({
    name: 'url_shortener_http_active_requests',
    help: 'Number of currently active HTTP requests',
    registers: [register],
});
// URL creation counter
const urlCreatedTotal = new prom_client_1.default.Counter({
    name: 'url_shortener_url_created_total',
    help: 'Total number of shortened URLs created',
    registers: [register],
});
exports.urlCreatedTotal = urlCreatedTotal;
// Redirect counter
const redirectTotal = new prom_client_1.default.Counter({
    name: 'url_shortener_redirect_total',
    help: 'Total number of redirects served',
    labelNames: ['cached', 'status'],
    registers: [register],
});
exports.redirectTotal = redirectTotal;
// Cache hit/miss counters
const cacheHitTotal = new prom_client_1.default.Counter({
    name: 'url_shortener_cache_hit_total',
    help: 'Total number of cache hits by layer',
    labelNames: ['layer'],
    registers: [register],
});
exports.cacheHitTotal = cacheHitTotal;
const cacheMissTotal = new prom_client_1.default.Counter({
    name: 'url_shortener_cache_miss_total',
    help: 'Total number of cache misses by layer',
    labelNames: ['layer'],
    registers: [register],
});
exports.cacheMissTotal = cacheMissTotal;
// Database query duration histogram
const dbQueryDuration = new prom_client_1.default.Histogram({
    name: 'url_shortener_db_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [register],
});
exports.dbQueryDuration = dbQueryDuration;
// Redis operation duration histogram
const redisOperationDuration = new prom_client_1.default.Histogram({
    name: 'url_shortener_redis_operation_duration_seconds',
    help: 'Duration of Redis operations in seconds',
    labelNames: ['operation'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
    registers: [register],
});
exports.redisOperationDuration = redisOperationDuration;
// Error counter
const errorTotal = new prom_client_1.default.Counter({
    name: 'url_shortener_errors_total',
    help: 'Total number of errors by type',
    labelNames: ['type'],
    registers: [register],
});
exports.errorTotal = errorTotal;
// HTTP request metrics middleware
function metricsMiddleware(req, res, next) {
    const start = Date.now();
    activeRequests.inc();
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route?.path || req.path || 'unknown';
        activeRequests.dec();
        httpRequestDuration.observe({ method: req.method, route, status: res.statusCode }, duration);
        httpRequestTotal.inc({ method: req.method, route, status: res.statusCode });
    });
    next();
}
// Metrics endpoint — Prometheus scrapes this
async function metricsEndpoint(_req, res) {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
}
//# sourceMappingURL=metrics.js.map