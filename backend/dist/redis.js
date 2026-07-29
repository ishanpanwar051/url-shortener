"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("./config");
const logger_1 = __importDefault(require("./utils/logger"));
const redisOptions = {
    retryStrategy: (times) => Math.min(Math.pow(times, 2) * 100, 5000),
    maxRetriesPerRequest: 10,
    enableOfflineQueue: true,
    lazyConnect: true,
    connectTimeout: 10000,
    enableReadyCheck: true,
};
// TLS required for cloud Redis providers (Upstash, Redis Labs, etc.)
if (config_1.config.redisUrl && config_1.config.redisUrl.includes('upstash.io')) {
    redisOptions.tls = {};
}
const redis = new ioredis_1.default(config_1.config.redisUrl, redisOptions);
redis.on('error', (err) => {
    logger_1.default.error({ err }, 'Redis connection error');
});
redis.on('reconnect', () => {
    logger_1.default.info('Redis reconnecting');
});
exports.default = redis;
//# sourceMappingURL=redis.js.map