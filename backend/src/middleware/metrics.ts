import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// Register default metrics (Node.js event loop, memory, GC, etc.)
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'url_shortener_' });

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'url_shortener_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// HTTP request counter
const httpRequestTotal = new client.Counter({
  name: 'url_shortener_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// Active requests gauge
const activeRequests = new client.Gauge({
  name: 'url_shortener_http_active_requests',
  help: 'Number of currently active HTTP requests',
  registers: [register],
});

// URL creation counter
const urlCreatedTotal = new client.Counter({
  name: 'url_shortener_url_created_total',
  help: 'Total number of shortened URLs created',
  registers: [register],
});

// Redirect counter
const redirectTotal = new client.Counter({
  name: 'url_shortener_redirect_total',
  help: 'Total number of redirects served',
  labelNames: ['cached', 'status'],
  registers: [register],
});

// Cache hit/miss counters
const cacheHitTotal = new client.Counter({
  name: 'url_shortener_cache_hit_total',
  help: 'Total number of cache hits by layer',
  labelNames: ['layer'],
  registers: [register],
});

const cacheMissTotal = new client.Counter({
  name: 'url_shortener_cache_miss_total',
  help: 'Total number of cache misses by layer',
  labelNames: ['layer'],
  registers: [register],
});

// Database query duration histogram
const dbQueryDuration = new client.Histogram({
  name: 'url_shortener_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

// Redis operation duration histogram
const redisOperationDuration = new client.Histogram({
  name: 'url_shortener_redis_operation_duration_seconds',
  help: 'Duration of Redis operations in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
  registers: [register],
});

// Error counter
const errorTotal = new client.Counter({
  name: 'url_shortener_errors_total',
  help: 'Total number of errors by type',
  labelNames: ['type'],
  registers: [register],
});

// HTTP request metrics middleware
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
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
export async function metricsEndpoint(_req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
}

// Export counters for use in service layer
export {
  urlCreatedTotal,
  redirectTotal,
  cacheHitTotal,
  cacheMissTotal,
  dbQueryDuration,
  redisOperationDuration,
  errorTotal,
  register,
};
