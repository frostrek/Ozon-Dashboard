#!/usr/bin/env bun

/**
 * M5 — Insert + dedup  (Dual-mode: SQLite PRIMARY + Supabase OPTIONAL)
 *
 * Strategy:
 *   1. Always write to MongoDB — never fails due to a cloud quota.
 *   2. Attempt Supabase sync. If quota/error → log warning, continue normally.
 *
 * Brand name cleaning (Amazon returns junk like "Visit the X Store" / "Brand: X"):
 *   "Visit the X Store" → "X"
 *   "Brand: X"         → "X"
 *
 * scrape_status:
 *   enriched       — weight known and < 500g (pushable to Ozon)
 *   blocked_weight — weight null or >= 500g (skipped at push time)
 *
 * Run:
 *   bun --env-file=.env m5-insert.js
 */

import { upsertProducts, getExistingAsins, countProducts, fillMissingImages } from "./m-local-db.js";

const SUPABASE_URL = Bun.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = Bun.env.SUPABASE_SERVICE_KEY ?? "";
const INPUT_FILE   = "m1-m3-output.json";

// Supabase is OPTIONAL — pipeline works without it
const supabaseAvailable = !!(SUPABASE_URL && SUPABASE_KEY);

// ─── Supabase REST helper (optional) ─────────────────────────────────────────

async function supabaseUpsert(table, rows) {
  if (!supabaseAvailable) throw new Error("Supabase credentials not set");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=asin`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err.slice(0, 300)}`);
  }
  return await res.json();
}

// ─── Brand name cleaner ───────────────────────────────────────────────────────
// Amazon sometimes returns storefront names instead of clean brand names.
// Patterns seen in the wild:
//   "Visit the RE' EQUIL Store" → "RE' EQUIL"
//   "Visit the L'Oreal Paris Store" → "L'Oreal Paris"
//   "Brand: Vaseline"              → "Vaseline"
//   "Brand: POND'S"                → "POND'S"

function cleanBrand(raw) {
  if (!raw) return null;
  let b = String(raw).trim();
  // Strip common Amazon prefixes
  const visitMatch = b.match(/^Visit the (.+?) Store$/i);
  if (visitMatch) b = visitMatch[1].trim();
  const brandMatch = b.match(/^Brand:\s*(.+)$/i);
  if (brandMatch) b = brandMatch[1].trim();
  // Strip "Official Store"
  b = b.replace(/\s+Official Store$/i, '').trim();
  // Punctuation normalization
  return b.replace(/[^\p{L}\p{N}\s&'-]/gu, '').replace(/\s+/g, ' ').trim();
}

// ─── Clean invisible Unicode chars ───────────────────────────────────────────

function clean(val) {
  if (typeof val === "string")
    return val.replace(/[\u200e\u200f\u200b\u00ad]/g, "").trim();
  if (Array.isArray(val)) return val.map(clean);
  return val;
}

// ─── scrape_status ────────────────────────────────────────────────────────────

function getScrapeStatus(p) {
  if (p.weight_grams === null || p.weight_grams === undefined) return "blocked_weight";
  if (p.weight_grams > 500) return "blocked_weight";
  return "enriched";
}

export function cleanProduct(p) {
  return {
    asin: p.asin,
    amazon_url: p.amazon_url,
    name: clean(p.name),
    feature_bullets: clean(p.feature_bullets ?? []),
    product_category: clean(p.product_category),
    price_inr: p.price_inr,
    original_price_inr: p.original_price_inr,
    rating: p.rating,
    total_reviews: p.total_reviews,
    image_urls: p.image_urls ?? [],
    weight_grams: p.weight_grams,
    dimensions: clean(p.dimensions),
    net_quantity: clean(p.net_quantity),
    volume_ml: p.volume_ml,
    ingredients: clean(p.ingredients),
    directions: clean(p.directions),
    specifications: p.specifications,
    raw_product_info: p.raw_product_info,
    manufacturer: clean(p.manufacturer),
    country_of_origin: clean(p.country_of_origin),
    brand: cleanBrand(clean(p.brand)),
    availability: p.availability,
    description: clean(p.description),
    parent_asin: p.parent_asin ?? null,
    variant_type: p.variant_type ?? null,
    variant_value: p.variant_value ?? null,
    scrape_status: getScrapeStatus(p),
    scraped_at: p.scraped_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}


// ─── Main Logic ───────────────────────────────────────────────────────────────

export async function insertProductsToDb(rawProducts) {
  const products = rawProducts
    .filter(p => p.price_inr > 0)
    .map(cleanProduct);

  const enriched     = products.filter(p => p.scrape_status === "enriched");
  const blockedWeight = products.filter(p => p.scrape_status === "blocked_weight");

  console.log("=== M5 — Insert + Dedup (SQLite primary / Supabase optional) ===");
  console.log(`  enriched       : ${enriched.length} (pushable to Ozon)`);
  console.log(`  blocked_weight : ${blockedWeight.length} (no weight or >= 500g)\n`);

  // Brand cleaning samples
  console.log("Brand cleaning samples:");
  rawProducts.slice(0, 5).forEach((original, i) => {
    if (products[i]) console.log(`  "${original.brand}" → "${products[i].brand}"`);
  });
  console.log();

  // ── STEP 1: SQLite (always) ──────────────────────────────────────────────────
  console.log("[1/3] Writing to MongoDB...");
  let sqliteInserted = 0;
  try {
    const existingAsins = await getExistingAsins();
    const toInsert = products.filter(p => !existingAsins.has(p.asin));
    const skipped  = products.length - toInsert.length;

    if (skipped > 0) {
      const existing = products.filter(p => existingAsins.has(p.asin));
      const filled = await fillMissingImages(existing);
      console.log(`  ⏭️  Skipping ${skipped} existing products (catalog dedup).`);
      if (filled) console.log(`  🖼️  Filled images on ${filled} existing product(s) that had none.`);
    }

    if (toInsert.length > 0) {
      sqliteInserted = await upsertProducts(toInsert);
      console.log(`  ✅ MongoDB: inserted ${sqliteInserted} new rows.`);
    } else {
      console.log("  ✅ MongoDB: no new products to insert.");
    }
  } catch (e) {
    console.error(`  ❌ MongoDB error: ${e.message}`);
    throw e;
  }

  const sqliteTotal = await countProducts();
  console.log(`  📦 MongoDB total: ${sqliteTotal} products`);

  // ── STEP 2: Supabase sync (optional) ────────────────────────────────────────
  console.log("\n[2/3] Syncing to Supabase (optional)...");
  let supabaseInserted = 0;
  let supabaseError = null;

  if (!supabaseAvailable) {
    console.log("  ⚠️  Supabase credentials not set — skipping cloud sync.");
  } else {
    try {
      // Fetch cloud ASINs for dedup
      const cloudRes = await fetch(
        `${SUPABASE_URL}/rest/v1/products?select=asin`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          signal: AbortSignal.timeout(15_000) }
      );
      if (!cloudRes.ok) throw new Error(`Supabase status ${cloudRes.status}`);
      const cloudData = await cloudRes.json();
      const cloudAsins = new Set((cloudData || []).map(r => r.asin));

      const cloudToInsert = products.filter(p => !cloudAsins.has(p.asin));
      if (cloudToInsert.length > 0) {
        const inserted = await supabaseUpsert("products", cloudToInsert);
        supabaseInserted = inserted.length;
        console.log(`  ✅ Supabase: synced ${supabaseInserted} new rows.`);
      } else {
        console.log("  ✅ Supabase: already up-to-date.");
      }
    } catch (e) {
      supabaseError = e.message;
      const isQuota = e.message.includes("storage_size_quota") || e.message.includes("quota") || e.message.includes("limit") || e.message.includes("413");
      if (isQuota) {
        console.log(`  ⚠️  Supabase quota exceeded — data safely stored in local SQLite.`);
      } else {
        console.log(`  ⚠️  Supabase sync failed (${e.message.slice(0, 80)}) — data safely stored in local SQLite.`);
      }
    }
  }

  // ── STEP 3: Verify ──────────────────────────────────────────────────────────
  console.log("\n[3/3] Summary");
  console.log(`  MongoDB catalog: ${sqliteTotal} total products`);
  if (supabaseAvailable && !supabaseError) {
    try {
      const countRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=count`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" },
          signal: AbortSignal.timeout(10_000) });
      const cloudTotal = countRes.headers.get("content-range")?.split("/")?.[1] ?? "?";
      console.log(`  Supabase cloud: ${cloudTotal} total products`);
    } catch {}
  } else if (supabaseError) {
    console.log(`  Supabase cloud: unavailable (${supabaseError.slice(0, 60)})`);
  }

  console.log("\n=== Gate 2 checklist ===");
  console.log("  [ ] SQLite total matches expected count");
  console.log("  [ ] Brand column shows clean names (no 'Visit the' / 'Brand:' junk)");
  console.log("  [ ] weight_grams is numeric, not a string");
  console.log("  [ ] enriched vs blocked_weight counts look right");

  return {
    inserted: sqliteInserted,
    enriched: enriched.length,
    blockedWeight: blockedWeight.length,
    enrichedProductsData: enriched,
  };
}

if (import.meta.main) {
  const file = Bun.file(INPUT_FILE);
  file.exists().then(async (exists) => {
    if (!exists) {
      console.error(`Input file not found: ${INPUT_FILE} — run m1-m3-scraper.js first`);
      process.exit(1);
    }
    const raw = await file.json();
    await insertProductsToDb(raw);
    console.log("\nNext: run m5b-countries-sync.js, then m5-verify.js");
  }).catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}
