import { createClient, RedisClientType } from 'redis';

const url = process.env.REDIS_URL;

declare global {
  // eslint-disable-next-line no-var
  var _redisClient: RedisClientType | undefined;
}

export async function getRedisClient() {
  if (!url) return null;

  if (!global._redisClient) {
    global._redisClient = createClient({ url });
    global._redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }

  if (!global._redisClient.isOpen) {
    try {
      await global._redisClient.connect();
    } catch (error) {
      console.error('Redis connection failed:', error);
      return null;
    }
  }

  return global._redisClient;
}
