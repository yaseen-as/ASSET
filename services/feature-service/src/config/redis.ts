import IORedis, { Redis } from 'ioredis';
import { config } from './index';

let cache: Redis | null = null;
export function getCache(): Redis {
  if (!cache) cache = new IORedis(config.redis.url);
  return cache;
}
