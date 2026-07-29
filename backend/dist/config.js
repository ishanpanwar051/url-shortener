"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cookieConfig = exports.config = void 0;
exports.validateConfig = validateConfig;
const JWT_SECRET_MIN_LENGTH = 32;
function validateConfig() {
    const required = ['JWT_SECRET'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Required environment variables are not set: ${missing.join(', ')}. ` +
            'Copy .env.example to .env and fill in the values.');
    }
    const secret = process.env.JWT_SECRET ?? '';
    if (secret.length < JWT_SECRET_MIN_LENGTH) {
        throw new Error(`JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters. ` +
            `Current length: ${secret.length}. ` +
            'Generate a secure key: openssl rand -base64 48');
    }
    if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
        throw new Error('CORS_ORIGIN must be set in production. ' +
            'Set it to your frontend URL (e.g. https://yourdomain.com)');
    }
    const origin = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : '*');
    if (process.env.NODE_ENV === 'production' && origin === '*') {
        throw new Error('CORS origin cannot be wildcard (*) in production when credentials are enabled. ' +
            'Set CORS_ORIGIN to your frontend URL.');
    }
}
exports.config = {
    port: parseInt(process.env.PORT || '3000', 10),
    databaseUrl: process.env.DATABASE_URL || 'postgresql://user:password@postgres:5432/urlshortener?connection_limit=20&pool_timeout=10',
    replicaDatabaseUrl: process.env.REPLICA_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://user:password@postgres:5432/urlshortener?connection_limit=20&pool_timeout=10',
    redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    machineId: parseInt(process.env.MACHINE_ID || '1', 10),
    bloomFilterExpected: parseInt(process.env.BLOOM_FILTER_EXPECTED || '1000000', 10),
    bloomFilterFpr: parseFloat(process.env.BLOOM_FILTER_FPR || '0.01'),
    lruCacheCapacity: parseInt(process.env.LRU_CACHE_CAPACITY || '10000', 10),
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10),
    shortCodeLength: parseInt(process.env.SHORT_CODE_LENGTH || '7', 10),
    defaultUrlExpiryDays: parseInt(process.env.DEFAULT_URL_EXPIRY_DAYS || '365', 10),
    corsOrigin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : '*'),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    isProduction: process.env.NODE_ENV === 'production',
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
    cookieSecure: process.env.NODE_ENV === 'production',
};
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
exports.cookieConfig = {
    name: 'token',
    options: {
        httpOnly: true,
        secure: exports.config.isProduction,
        sameSite: 'strict',
        path: '/',
        domain: exports.config.cookieDomain,
        maxAge: SEVEN_DAYS_MS,
    },
};
//# sourceMappingURL=config.js.map