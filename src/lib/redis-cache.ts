import { getRedisClient } from "@/lib/redis";

export async function getJsonCache<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Redis get failed for key ${key}:`, error);
    return null;
  }
}

export async function setJsonCache(
  key: string,
  value: unknown,
  ttlSeconds: number,
) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.error(`Redis set failed for key ${key}:`, error);
  }
}

export async function deleteJsonCache(key: string) {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Redis delete failed for key ${key}:`, error);
  }
}

export async function deleteCacheByPrefix(prefix: string) {
  const redis = await getRedisClient();
  if (!redis) return;
  if (!prefix) return;

  try {
    for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
      await redis.del(key as string);
    }
  } catch (error) {
    console.error(`Redis delete failed for prefix ${prefix}:`, error);
  }
}
