#!/usr/bin/env bun

/**
 * M5 — Insert + dedup. Products are stored in MongoDB.
 * Supabase is not called. Set SUPABASE_SYNC=1 only if a separate cloud copy is required.
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

const INPUT_FILE   = "m1-m3-output.json";

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

  console.log("=== M5 — Insert + Dedup (MongoDB) ===");
  console.log(`  enriched       : ${enriched.length} (pushable to Ozon)`);
  console.log(`  blocked_weight : ${blockedWeight.length} (no weight or >= 500g)\n`);

  // Brand cleaning samples
  console.log("Brand cleaning samples:");
  rawProducts.slice(0, 5).forEach((original, i) => {
    if (products[i]) console.log(`  "${original.brand}" → "${products[i].brand}"`);
  });
  console.log();

  // ── STEP 1: SQLite (always) ──────────────────────────────────────────────────
  console.log("[1/2] Writing to MongoDB...");
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

  console.log("\n[2/2] Summary");
  console.log(`  MongoDB catalog: ${sqliteTotal} total products`);

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
