#!/usr/bin/env bun

/**
 * M-LOCAL-DB — Bun SQLite adapter for the Ozon pipeline
 *
 * Provides the same read/write interface as Supabase calls but stores
 * everything in `ozon-pipeline.db` (already on disk).
 *
 * Zero new dependencies — uses Bun's built-in `bun:sqlite`.
 *
 * Used as PRIMARY storage when Supabase quota is exceeded.
 * Also acts as an always-available local cache / offline fallback.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";

const DB_PATH = "./ozon-pipeline.db";

// ─── Singleton connection ─────────────────────────────────────────────────────
let _db = null;

export function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH, { create: true });
  _db.run("PRAGMA journal_mode = WAL");   // concurrent reads
  _db.run("PRAGMA foreign_keys = ON");
  initSchema(_db);
  return _db;
}

// ─── Schema bootstrap ─────────────────────────────────────────────────────────

function initSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      asin              TEXT NOT NULL UNIQUE,
      amazon_url        TEXT,
      name              TEXT NOT NULL,
      feature_bullets   TEXT,           -- JSON array stored as text
      product_category  TEXT,
      price_inr         REAL,
      original_price_inr REAL,
      rating            REAL,
      total_reviews     INTEGER,
      image_urls        TEXT,           -- JSON array stored as text
      weight_grams      INTEGER,
      dimensions        TEXT,
      net_quantity      TEXT,
      volume_ml         INTEGER,
      ingredients       TEXT,
      directions        TEXT,
      specifications    TEXT,           -- JSON
      raw_product_info  TEXT,           -- JSON
      description       TEXT,
      manufacturer      TEXT,
      country_of_origin TEXT,
      brand             TEXT,
      availability      TEXT,
      parent_asin       TEXT,           -- cosmetic variant link
      variant_type      TEXT,           -- e.g. 'Color/Shade'
      variant_value     TEXT,           -- e.g. '115 Ivory'
      scrape_status     TEXT NOT NULL DEFAULT 'enriched',
      scraped_at        TEXT,
      updated_at        TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_products_asin        ON products(asin)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_products_parent_asin ON products(parent_asin)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_products_status      ON products(scrape_status)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS ozon_countries (
      ozon_id   INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      fetched_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ─── Upload tracking table (duplicate prevention) ───
  db.run(`
    CREATE TABLE IF NOT EXISTS ozon_uploads (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_asin TEXT NOT NULL,
      parent_asin  TEXT,
      ozon_task_id TEXT,
      status       TEXT NOT NULL DEFAULT 'SUCCESS',
      uploaded_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(variant_asin)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_uploads_variant ON ozon_uploads(variant_asin)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_uploads_parent  ON ozon_uploads(parent_asin)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS scrape_progress (
      progress_key TEXT PRIMARY KEY,
      keyword      TEXT NOT NULL,
      brand        TEXT,
      category_id  INTEGER NOT NULL,
      type_id      INTEGER NOT NULL,
      last_page    INTEGER NOT NULL,
      updated_at   TEXT DEFAULT (datetime('now'))
    )
  `);
}

export function saveScrapeProgress({ keyword, brand = "", categoryId, typeId, lastPage }) {
  const page = Number(lastPage);
  const catId = Number(categoryId);
  const type = Number(typeId);
  const cleanKeyword = String(keyword || "").trim();
  if (!cleanKeyword || !(page >= 1) || !catId || !type) return;
  const db = getDb();
  const key = `${(brand ? `${brand} ${cleanKeyword}` : cleanKeyword).toLowerCase().trim()}|${catId}|${type}`;
  db.prepare(`
    INSERT INTO scrape_progress (progress_key, keyword, brand, category_id, type_id, last_page, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(progress_key) DO UPDATE SET
      last_page = excluded.last_page,
      updated_at = excluded.updated_at
  `).run(key, cleanKeyword, String(brand || "").trim(), catId, type, page);
}

// ─── Helper: serialize arrays/objects for storage ────────────────────────────

function serialize(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function deserialize(val) {
  if (val === null || val === undefined) return null;
  try { return JSON.parse(val); } catch { return val; }
}

// ─── Product upsert ───────────────────────────────────────────────────────────

/**
 * Upserts an array of clean product objects into SQLite.
 * Returns how many were newly inserted.
 */
export function upsertProducts(products) {
  const db = getDb();
  let inserted = 0;

  const stmt = db.prepare(`
    INSERT INTO products (
      asin, amazon_url, name, feature_bullets, product_category,
      price_inr, original_price_inr, rating, total_reviews, image_urls,
      weight_grams, dimensions, net_quantity, volume_ml, ingredients,
      directions, specifications, raw_product_info, description,
      manufacturer, country_of_origin, brand, availability,
      parent_asin, variant_type, variant_value,
      scrape_status, scraped_at, updated_at
    ) VALUES (
      $asin, $amazon_url, $name, $feature_bullets, $product_category,
      $price_inr, $original_price_inr, $rating, $total_reviews, $image_urls,
      $weight_grams, $dimensions, $net_quantity, $volume_ml, $ingredients,
      $directions, $specifications, $raw_product_info, $description,
      $manufacturer, $country_of_origin, $brand, $availability,
      $parent_asin, $variant_type, $variant_value,
      $scrape_status, $scraped_at, datetime('now')
    )
    ON CONFLICT(asin) DO UPDATE SET
      name              = excluded.name,
      price_inr         = excluded.price_inr,
      image_urls        = CASE
        WHEN excluded.image_urls IS NULL
          OR excluded.image_urls = ''
          OR excluded.image_urls = '[]'
          OR excluded.image_urls = 'null'
        THEN products.image_urls
        ELSE excluded.image_urls
      END,
      parent_asin       = excluded.parent_asin,
      variant_type      = excluded.variant_type,
      variant_value     = excluded.variant_value,
      scrape_status     = excluded.scrape_status,
      updated_at        = datetime('now')
  `);

  const insertMany = db.transaction((rows) => {
    for (const p of rows) {
      const existing = db.prepare(`SELECT id FROM products WHERE asin = ?`).get(p.asin);
      stmt.run({
        $asin:               p.asin,
        $amazon_url:         p.amazon_url ?? null,
        $name:               p.name,
        $feature_bullets:    serialize(p.feature_bullets),
        $product_category:   p.product_category ?? null,
        $price_inr:          p.price_inr ?? null,
        $original_price_inr: p.original_price_inr ?? null,
        $rating:             p.rating ?? null,
        $total_reviews:      p.total_reviews ?? null,
        $image_urls:         serialize(p.image_urls),
        $weight_grams:       p.weight_grams ?? null,
        $dimensions:         p.dimensions ?? null,
        $net_quantity:       p.net_quantity ?? null,
        $volume_ml:          p.volume_ml ?? null,
        $ingredients:        p.ingredients ?? null,
        $directions:         p.directions ?? null,
        $specifications:     serialize(p.specifications),
        $raw_product_info:   serialize(p.raw_product_info),
        $description:        p.description ?? null,
        $manufacturer:       p.manufacturer ?? null,
        $country_of_origin:  p.country_of_origin ?? null,
        $brand:              p.brand ?? null,
        $availability:       p.availability ?? null,
        $parent_asin:        p.parent_asin ?? null,
        $variant_type:       p.variant_type ?? null,
        $variant_value:      p.variant_value ?? null,
        $scrape_status:      p.scrape_status ?? "enriched",
        $scraped_at:         p.scraped_at ?? new Date().toISOString(),
      });
      if (!existing) inserted++;
    }
  });

  insertMany(products);
  return inserted;
}

/**
 * Fill image URLs only when a saved product has none.
 * A later scrape that finds no image leaves the stored URLs in place.
 */
export function fillMissingImages(products) {
  const db = getDb();
  const select = db.prepare(`SELECT image_urls FROM products WHERE asin = ?`);
  const update = db.prepare(`UPDATE products SET image_urls = ?, updated_at = datetime('now') WHERE asin = ?`);
  const write = db.transaction((rows) => {
    let filled = 0;
    for (const product of rows || []) {
      const incoming = Array.isArray(product?.image_urls)
        ? product.image_urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url))
        : [];
      if (!product?.asin || !incoming.length) continue;
      const row = select.get(product.asin);
      if (!row) continue;
      let current = [];
      try { current = JSON.parse(row.image_urls || "[]"); } catch { current = []; }
      if (Array.isArray(current) && current.some((url) => typeof url === "string" && url.startsWith("http"))) continue;
      update.run(JSON.stringify(incoming), product.asin);
      filled += 1;
    }
    return filled;
  });
  return write(products || []);
}

// ─── Product reads ────────────────────────────────────────────────────────────

/**
 * Read all products (or filtered by status).
 * Automatically deserializes JSON columns back to arrays/objects.
 */
export function getProducts({ status = null, limit = 1000, offset = 0 } = {}) {
  const db = getDb();
  let rows;
  if (status) {
    rows = db.prepare(`SELECT * FROM products WHERE scrape_status = ? LIMIT ? OFFSET ?`)
              .all(status, limit, offset);
  } else {
    rows = db.prepare(`SELECT * FROM products LIMIT ? OFFSET ?`).all(limit, offset);
  }
  return rows.map(hydrateProduct);
}

/**
 * Fetch variant children of a parent ASIN.
 */
export function getVariantChildren(parentAsin, limit = 5) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE parent_asin = ?
      AND variant_type IS NOT NULL
    ORDER BY asin
    LIMIT ?
  `).all(parentAsin, limit);
  return rows.map(hydrateProduct);
}

/**
 * Fetch a single product by ASIN.
 */
export function getProductByAsin(asin) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM products WHERE asin = ?`).get(asin);
  return row ? hydrateProduct(row) : null;
}

/**
 * Count total products.
 */
export function countProducts() {
  const db = getDb();
  return db.prepare(`SELECT COUNT(*) as c FROM products`).get().c;
}

/**
 * Get all existing ASINs (for dedup).
 */
export function getExistingAsins() {
  const db = getDb();
  return new Set(db.prepare(`SELECT asin FROM products`).all().map(r => r.asin));
}

// ─── Country lookup ───────────────────────────────────────────────────────────

export function getCountryId(name) {
  const db = getDb();
  const row = db.prepare(`SELECT ozon_id FROM ozon_countries WHERE name = ?`).get(name);
  return row?.ozon_id ?? 90312; // India default
}

export function upsertCountry(ozon_id, name) {
  const db = getDb();
  db.prepare(`
    INSERT INTO ozon_countries (ozon_id, name)
    VALUES (?, ?)
    ON CONFLICT(ozon_id) DO UPDATE SET name = excluded.name
  `).run(ozon_id, name);
}

// ─── Internal: rehydrate a DB row to a product object ────────────────────────

function hydrateProduct(row) {
  return {
    ...row,
    feature_bullets: deserialize(row.feature_bullets) ?? [],
    image_urls:      deserialize(row.image_urls) ?? [],
    specifications:  deserialize(row.specifications),
    raw_product_info: deserialize(row.raw_product_info),
  };
}

// ─── Stats / health ───────────────────────────────────────────────────────────

export function dbStats() {
  const db = getDb();
  const total      = db.prepare(`SELECT COUNT(*) as c FROM products`).get().c;
  const enriched   = db.prepare(`SELECT COUNT(*) as c FROM products WHERE scrape_status = 'enriched'`).get().c;
  const variants   = db.prepare(`SELECT COUNT(*) as c FROM products WHERE variant_type IS NOT NULL`).get().c;
  const parents    = db.prepare(`SELECT COUNT(DISTINCT parent_asin) as c FROM products WHERE parent_asin IS NOT NULL`).get().c;
  return { total, enriched, variants, parents, db_path: DB_PATH };
}

// ─── Upload Dedup API (DB-level) ─────────────────────────────────────────────────────────

/**
 * Returns the existing upload record if variant_asin was already uploaded.
 * Returns null if it has never been uploaded.
 */
export function isAlreadyUploaded(variantAsin) {
  const db = getDb();
  return db.prepare(`SELECT * FROM ozon_uploads WHERE variant_asin = ?`).get(variantAsin) ?? null;
}

/**
 * Records a successful upload to prevent re-uploads on subsequent runs.
 */
export function markAsUploaded(variantAsin, parentAsin, ozonTaskId) {
  const db = getDb();
  db.prepare(`
    INSERT INTO ozon_uploads (variant_asin, parent_asin, ozon_task_id, status)
    VALUES (?, ?, ?, 'SUCCESS')
    ON CONFLICT(variant_asin) DO UPDATE SET
      ozon_task_id = excluded.ozon_task_id,
      status       = 'SUCCESS',
      uploaded_at  = datetime('now')
  `).run(variantAsin, parentAsin ?? null, ozonTaskId ?? null);
}

/**
 * Returns upload stats for the summary report.
 */
export function uploadStats() {
  const db = getDb();
  const total    = db.prepare(`SELECT COUNT(*) as c FROM ozon_uploads`).get().c;
  const today    = db.prepare(`SELECT COUNT(*) as c FROM ozon_uploads WHERE date(uploaded_at) = date('now')`).get().c;
  return { total_ever: total, uploaded_today: today };
}

// ─── CLI self-test ────────────────────────────────────────────────────────────────

if (import.meta.main) {
  console.log("=== m-local-db.js — SQLite Health Check ===");
  const stats = dbStats();
  console.log(`  DB path      : ${stats.db_path}`);
  console.log(`  Total rows   : ${stats.total}`);
  console.log(`  Enriched     : ${stats.enriched}`);
  console.log(`  Variants     : ${stats.variants}`);
  console.log(`  Parent groups: ${stats.parents}`);
  console.log("\n✅ SQLite is healthy and ready.");
}
