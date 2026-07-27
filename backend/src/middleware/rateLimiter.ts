import { Request, Response, NextFunction } from 'express';
import redis from '../redis';
import { config } from '../config';

const AUTH_RATE_LIMIT = 10;
const WINDOW_SECONDS = 60;

// Lua script: atomic INCR + EXPIRE
// Returns [current_count, ttl]
const RATE_LIMIT_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  local ttl = redis.call('TTL', KEYS[1])
  return {current, ttl}
`;

export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  await applyRateLimit(req, res, next, 'ratelimit', config.rateLimitPerMinute);
}

export async function authRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  await applyRateLimit(req, res, next, 'authlimit', AUTH_RATE_LIMIT);
}

async function applyRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
  prefix: string,
  limit: number,
): Promise<void> {
  const key = `${prefix}:${req.path}:${req.ip}`;

  let raw: any;
  try {
    raw = await redis.eval(RATE_LIMIT_SCRIPT, 1, key, WINDOW_SECONDS.toString());
  } catch {
    next();
    return;
  }

  const current = Number(raw[0]);
  const ttl = Number(raw[1]);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
  res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + ttl);

  if (current >= limit) {
    res.setHeader('Retry-After', ttl);
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: ttl,
    });
    return;
  }

  next();
}
