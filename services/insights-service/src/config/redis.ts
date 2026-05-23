import IORedis, { Redis } from 'ioredis';
import { config } from './index';

// BullMQ requires maxRetriesPerRequest=null on its connection.
export function makeQueueConnection(): Redis {
  return new IORedis(config.redis.url, { maxRetriesPerRequest: null });
}

export function makePubSubConnection(): Redis {
  return new IORedis(config.redis.url);
}
