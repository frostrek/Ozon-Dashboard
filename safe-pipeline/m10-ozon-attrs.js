#!/usr/bin/env bun

/**
 * M10 — Ozon Category Attribute Fetcher
 *
 * Fetches the FULL list of attributes for a given Ozon category + type.
 * Results are cached to ozon-attrs-cache.json to avoid hammering the API.
 */

import { readFileSync } from "fs";

const OZON_CLIENT_ID = Bun.env.OZON_CLIENT_ID;
const OZON_API_KEY   = Bun.env.OZON_API_KEY;
const OZON_HOST      = "https://api-seller.ozon.ru";
const CACHE_FILE     = "./ozon-attrs-cache.json";

// ─── Ozon API helper ──────────────────────────────────────────────────────────

async function ozonPost(path, body) {
  const res = await fetch(`${OZON_HOST}${path}`, {
    method: "POST",
    headers: {
      "Client-Id":    OZON_CLIENT_ID,
      "Api-Key":      OZON_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Ozon ${res.status} at ${path}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

let memCache = null;
async function loadCache() {
  if (memCache) return memCache;
  const file = Bun.file(CACHE_FILE);
  if (!(await file.exists())) return {};
  try { memCache = await file.json(); return memCache; } catch { return {}; }
}

async function saveCache(cache) {
  memCache = cache;
  await Bun.write(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function clearAttributeCache() {
  memCache = null;
  return Bun.write(CACHE_FILE, "{}");
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

const pendingRequests = new Map();

export async function fetchCategoryAttributes(catId, typeId) {
  if (!OZON_CLIENT_ID || !OZON_API_KEY) {
    throw new Error("Missing OZON_CLIENT_ID or OZON_API_KEY — check .env");
  }

  const cacheKey = `${catId}_${typeId}`;
  
  // 1. Check disk cache
  const cache = await loadCache();
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  // 2. Check if a request is already in-flight for this category
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  console.log(`  [m10] Fetching attribute list from Ozon for category ${catId} / type ${typeId}...`);

  // 3. Create the API promise and store it in pendingRequests Map BEFORE awaiting
  const requestPromise = (async () => {
    try {
      const data = await ozonPost("/v1/description-category/attribute", {
        description_category_id: catId,
        type_id:                 typeId,
        language:                "RU",
      });

      const attrs = data?.result ?? [];
      console.log(`  [m10] Received ${attrs.length} attributes from Ozon.`);

      // Update disk cache
      const freshCache = await loadCache();
      freshCache[cacheKey] = attrs;
      await saveCache(freshCache);

      return attrs;
    } finally {
      pendingRequests.delete(cacheKey); // Clean up the map
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

if (import.meta.main) {
  let conf = {};
  try { conf = JSON.parse(readFileSync("./l98.conf.json", "utf8")); } catch (_) {}

  const catId  = conf?.push?.ozon_category?.description_category_id ?? 17028991;
  const typeId = conf?.push?.ozon_category?.type_id ?? 629618165;

  console.log("=== M10 — Ozon Category Attribute Fetcher ===");
  console.log(`Category: ${catId}  |  Type: ${typeId}\n`);

  const attrs = await fetchCategoryAttributes(catId, typeId);
  console.log(`\nTotal attributes : ${attrs.length}`);
}
