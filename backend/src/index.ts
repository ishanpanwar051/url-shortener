import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config, validateConfig } from './config';
import prisma from './db';
import redis from './redis';
import logger from './utils/logger';
import { urlService } from './services/url.service';
import { metricsMiddleware, metricsEndpoint, errorTotal } from './middleware/metrics';
import authRoutes from './routes/auth.routes';
import urlRoutes from './routes/url.routes';
import redirectRoutes from './routes/redirect.routes';

validateConfig();

const app = express();

let isShuttingDown = false;

// Reject new requests during graceful shutdown
app.use((_req, res, next) => {
  if (isShuttingDown) {
    res.status(503).json({ error: 'Server shutting down' });
    return;
  }
  next();
});

app.use(helmet());
app.set('trust proxy', 1);
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Request ID middleware — attaches unique ID to every request
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// Prometheus metrics middleware — must be before routes
app.use(metricsMiddleware);

// Structured request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      requestId: (req as any).requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  });
  next();
});

// Metrics endpoint — Prometheus scrapes this
app.get('/metrics', metricsEndpoint);

// Serve frontend static files
const frontendBuildPath = path.join(__dirname, '../../frontend/build');
app.use(express.static(frontendBuildPath));

// Health check — verifies dependencies and returns 503 during shutdown
app.get('/health', async (_req, res) => {
  if (isShuttingDown) {
    res.status(503).json({ status: 'shutting down' });
    return;
  }
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'down';
    healthy = false;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'down';
    healthy = false;
  }

  if (!healthy) {
    res.status(503).json({ status: 'degraded', checks });
    return;
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString(), checks });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', urlRoutes);
app.use('/', redirectRoutes);

// SPA fallback - serve index.html for client-side routing
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Global error handler — prevents stack trace leaks
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, requestId: (req as any).requestId }, 'Unhandled error');
  errorTotal.inc({ type: 'unhandled' });
  res.status(500).json({ error: 'Internal server error' });
});

// Acquire a distributed lock with a unique value to prevent accidental release
async function acquireDistributedLock(name: string, ttl = 30): Promise<string | null> {
  const value = uuidv4();
  try {
    const result = await redis.set(`lock:${name}`, value, 'EX', ttl, 'NX');
    return result === 'OK' ? value : null;
  } catch {
    return null;
  }
}

async function releaseDistributedLock(name: string, expectedValue: string): Promise<void> {
  // Lua script: atomically delete only if value matches
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    await redis.eval(script, 1, `lock:${name}`, expectedValue);
  } catch {
    // Best-effort release
  }
}

// Cleanup expired URLs — only the instance holding the lock does this
const cleanupInterval = setInterval(async () => {
  const lockValue = await acquireDistributedLock('cleanup-expired', 60);
  if (!lockValue) return;

  try {
    const result = await prisma.uRL.updateMany({
      where: {
        expiresAt: { lte: new Date() },
        isActive: true,
      },
      data: { isActive: false },
    });
    if (result.count > 0) {
      logger.info('Expired %d URLs', result.count);
    }
  } catch (err) {
    logger.error({ err }, 'Expired URL cleanup failed');
  } finally {
    await releaseDistributedLock('cleanup-expired', lockValue);
  }
}, 60 * 60 * 1000);
cleanupInterval.unref();

// Flush buffered clicks to the database — only the instance holding the lock does this
const clickFlushInterval = setInterval(async () => {
  const lockValue = await acquireDistributedLock('flush-clicks', 15);
  if (!lockValue) return;

  try {
    const flushed = await urlService.flushClickQueue();
    if (flushed > 0) {
      logger.info('Flushed %d buffered clicks', flushed);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to flush click queue');
  } finally {
    await releaseDistributedLock('flush-clicks', lockValue);
  }
}, 10_000);
clickFlushInterval.unref();

const server = app.listen(config.port, () => {
  logger.info('URL Shortener API running on port %d', config.port);
});

const GRACEFUL_SHUTDOWN_TIMEOUT = 10_000;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Received %s. Starting graceful shutdown...', signal);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT);
  forceExit.unref();

  // Stop accepting new connections; drain existing in-flight requests
  server.close(() => {
    logger.info('HTTP server closed.');
  });

  clearInterval(cleanupInterval);
  clearInterval(clickFlushInterval);
  logger.info('Background intervals cleared.');

  try {
    await prisma.$disconnect();
    logger.info('Database disconnected.');
  } catch (err) {
    logger.error({ err }, 'Error disconnecting database');
  }

  try {
    await redis.quit();
    logger.info('Redis disconnected.');
  } catch (err) {
    logger.error({ err }, 'Error disconnecting Redis');
  }

  clearTimeout(forceExit);
  logger.info('Graceful shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  shutdown('UNCAUGHT');
});

export default app;
