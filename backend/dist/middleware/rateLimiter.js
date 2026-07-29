"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = rateLimiter;
exports.authRateLimiter = authRateLimiter;
const redis_1 = __importDefault(require("../redis"));
const config_1 = require("../config");
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
async function rateLimiter(req, res, next) {
    await applyRateLimit(req, res, next, 'ratelimit', config_1.config.rateLimitPerMinute);
}
async function authRateLimiter(req, res, next) {
    await applyRateLimit(req, res, next, 'authlimit', AUTH_RATE_LIMIT);
}
async function applyRateLimit(req, res, next, prefix, limit) {
    const key = `${prefix}:${req.path}:${req.ip}`;
    let raw;
    try {
        raw = await redis_1.default.eval(RATE_LIMIT_SCRIPT, 1, key, WINDOW_SECONDS.toString());
    }
    catch {
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
//# sourceMappingURL=rateLimiter.js.map