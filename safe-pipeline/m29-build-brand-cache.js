#!/usr/bin/env bun

/**
 * Build a local brand dictionary cache for fast lookup.
 * Run this once per category to populate the cache file.
 * Usage: bun --env-file=.env m29-build-brand-cache.js [catId] [typeId]
 */

const OZON_CLIENT_ID = (Bun.env.OZON_CLIENT_ID ?? "").trim();
const OZON_API_KEY = (Bun.env.OZON_API_KEY ?? "").trim();

async function ozonPost(path, body) {
  const res = await fetch(`https://api-seller.ozon.ru${path}`, {
    method: "POST",
    headers: { "Client-Id": OZON_CLIENT_ID, "Api-Key": OZON_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

let RAM_CACHE = {};

export async function buildBrandCache(catId, typeId) {
  if (RAM_CACHE[catId]) return RAM_CACHE[catId];
  const cacheFile = `brand-cache-${catId}.json`;
  const file = Bun.file(cacheFile);

  // Return cached if already built
  if (await file.exists()) {
    const data = await file.json();
    if (data.length > 0) {
      console.log(`  [brand-cache] Loaded ${data.length} brands from cache for cat ${catId}`);
      RAM_CACHE[catId] = data;
      return data;
    }
  }

  console.log(`  [brand-cache] Building brand cache for category ${catId}...`);
  let all = [];
  let lastId = 0;

  while (true) {
    const data = await ozonPost("/v1/description-category/attribute/values", {
      description_category_id: catId, type_id: typeId, attribute_id: 85,
      language: "RU", limit: 1000, last_value_id: lastId
    });
    const items = data?.result ?? [];
    if (items.length === 0) break;
    all.push(...items);
    lastId = items[items.length - 1].id;
    if (items.length < 1000) break;
  }

  await Bun.write(cacheFile, JSON.stringify(all, null, 2));
  console.log(`  [brand-cache] Cached ${all.length} brands → ${cacheFile}`);
  RAM_CACHE[catId] = all;
  return all;
}

// Standalone run
if (import.meta.main) {
  const catId = parseInt(process.argv[2] || "17028991", 10);
  const typeId = parseInt(process.argv[3] || "93897", 10);
  buildBrandCache(catId, typeId).then(brands => {
    console.log(`\nDone. Total brands cached: ${brands.length}`);
  });
}
