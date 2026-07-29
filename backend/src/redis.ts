import Redis, { RedisOptions } from 'ioredis';
import { config } from './config';
import logger from './utils/logger';

const redisOptions: RedisOptions = {
  retryStrategy: (times) => Math.min(Math.pow(times, 2) * 100, 5000),
  maxRetriesPerRequest: 10,
  enableOfflineQueue: true,
  lazyConnect: true,
  connectTimeout: 10000,
  enableReadyCheck: true,
};

// TLS required for cloud Redis providers (Upstash, Redis Labs, etc.)
if (config.redisUrl && config.redisUrl.includes('upstash.io')) {
  redisOptions.tls = {};
}

const redis = new Redis(config.redisUrl, redisOptions);

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('reconnect', () => {
  logger.info('Redis reconnecting');
});

export default redis;
