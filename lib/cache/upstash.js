const REST_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const REST_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');

export function redisConfigured() {
  return Boolean(REST_URL && REST_TOKEN);
}

async function redisRun(command) {
  if (!redisConfigured()) return null;
  const response = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  return response.json().catch(() => null);
}

export async function cacheGet(key) {
  try {
    const data = await redisRun(['GET', key]);
    if (data?.result == null) return null;
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 60) {
  try {
    await redisRun(['SET', key, JSON.stringify(value), 'EX', String(Math.max(1, Number(ttlSeconds) || 60))]);
  } catch {
    /* Redis is optional; the page still loads from MongoDB */
  }
}

export async function withCache(key, ttlSeconds, loader) {
  const hit = await cacheGet(key);
  if (hit != null) return hit;
  const value = await loader();
  await cacheSet(key, value, ttlSeconds);
  return value;
}
