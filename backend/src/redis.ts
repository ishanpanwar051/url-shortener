import Redis from 'ioredis';
import { config } from './config';
import logger from './utils/logger';

const redis = new Redis(config.redisUrl, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

export default redis;
