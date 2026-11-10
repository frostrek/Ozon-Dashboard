const REST_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const REST_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');

// High-speed Node.js in-memory cache layer for instant sub-millisecond retrieval
const nodeMemoryCache = new Map();
const MAX_MEM_ITEMS = 500;
let redisDisabledUntil = 0;

function cleanMemoryCache() {
  const now = Date.now();
  for (const [k, v] of nodeMemoryCache.entries()) {
    if (v.expiresAt <= now) nodeMemoryCache.delete(k);
  }
}

export function redisConfigured() {
  if (Date.now() < redisDisabledUntil) return false;
  return Boolean(REST_URL && REST_TOKEN);
}

async function redisRun(command) {
  if (!redisConfigured()) return null;
  try {
    const response = await fetch(REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        redisDisabledUntil = Date.now() + 5 * 60 * 1000;
      }
      return null;
    }
    return response.json().catch(() => null);
  } catch {
    // If ENOTFOUND, DNS failure, or connection error, disable Redis for 5 minutes so it doesn't block page loads
    redisDisabledUntil = Date.now() + 5 * 60 * 1000;
    return null;
  }
}

export async function cacheGet(key) {
  const now = Date.now();
  const memHit = nodeMemoryCache.get(key);
  if (memHit && memHit.expiresAt > now) {
    return memHit.value;
  }
  try {
    const data = await redisRun(['GET', key]);
    if (data?.result == null) return null;
    const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    if (parsed != null) {
      nodeMemoryCache.set(key, { value: parsed, expiresAt: now + 60_000 });
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 60) {
  const ttl = Math.max(1, Number(ttlSeconds) || 60);
  const now = Date.now();
  if (nodeMemoryCache.size > MAX_MEM_ITEMS) {
    cleanMemoryCache();
    if (nodeMemoryCache.size > MAX_MEM_ITEMS) {
      const firstKey = nodeMemoryCache.keys().next().value;
      if (firstKey) nodeMemoryCache.delete(firstKey);
    }
  }
  nodeMemoryCache.set(key, { value, expiresAt: now + (ttl * 1000) });

  try {
    await redisRun(['SET', key, JSON.stringify(value), 'EX', String(ttl)]);
  } catch {
    /* Redis is optional; the page still loads from local memory & MongoDB */
  }
}

export async function withCache(key, ttlSeconds, loader) {
  const hit = await cacheGet(key);
  if (hit != null) return hit;
  const value = await loader();
  await cacheSet(key, value, ttlSeconds);
  return value;
}
