import Redis from 'ioredis';
import { config } from './config';
import logger from './utils/logger';

const redis = new Redis(config.redisUrl, {
  retryStrategy: (times) => Math.min(Math.pow(times, 2) * 100, 5000),
  maxRetriesPerRequest: 10,
  enableOfflineQueue: true,
  lazyConnect: true,
  connectTimeout: 10000,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('reconnect', () => {
  logger.info('Redis reconnecting');
});

export default redis;
