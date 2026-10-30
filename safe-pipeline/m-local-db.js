#!/usr/bin/env bun

/**
 * Catalog store for the Ozon pipeline.
 * Products, scrape progress, countries, and upload records live in MongoDB.
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

const PRODUCTS = "catalog_products";
const COUNTRIES = "catalog_ozon_countries";
const UPLOADS = "catalog_ozon_uploads";
const PROGRESS = "catalog_scrape_progress";

let clientPromise = null;

function uriFromEnvFile() {
  const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (!existsSync(envFile)) return "";
  const text = readFileSync(envFile, "utf8");
  const mongo = text.match(/^MONGODB_URI="([^"]+)"/m);
  if (mongo) return mongo[1];
  const database = text.match(/^DATABASE_URL="(mongodb[^"]+)"/m);
  return database?.[1] || "";
}

async function getDb() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || uriFromEnvFile();
    if (!uri || !uri.startsWith("mongodb")) throw new Error("MONGODB_URI is not set.");
    const client = new MongoClient(uri);
    clientPromise = client.connect().then(async (connected) => {
      const db = connected.db();
      await db.collection(PRODUCTS).createIndex({ asin: 1 }, { unique: true });
      await db.collection(UPLOADS).createIndex({ variant_asin: 1 }, { unique: true });
      return db;
    });
  }
  return clientPromise;
}

function serialize(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function deserialize(val) {
  if (val === null || val === undefined) return null;
  try { return JSON.parse(val); } catch { return val; }
}

function hydrateProduct(row) {
  if (!row) return null;
  return {
    ...row,
    feature_bullets: deserialize(row.feature_bullets) ?? [],
    image_urls: deserialize(row.image_urls) ?? [],
    specifications: deserialize(row.specifications),
    raw_product_info: deserialize(row.raw_product_info),
  };
}

function hasHttpImage(value) {
  const list = Array.isArray(value) ? value : deserialize(value);
  return Array.isArray(list) && list.some((url) => typeof url === "string" && url.startsWith("http"));
}

function nowStamp() {
  return new Date().toISOString();
}

export async function saveScrapeProgress({ keyword, brand = "", categoryId, typeId, lastPage }) {
  const page = Number(lastPage);
  const catId = Number(categoryId);
  const type = Number(typeId);
  const cleanKeyword = String(keyword || "").trim();
  if (!cleanKeyword || !(page >= 1) || !catId || !type) return;
  const key = `${(brand ? `${brand} ${cleanKeyword}` : cleanKeyword).toLowerCase().trim()}|${catId}|${type}`;
  const db = await getDb();
  await db.collection(PROGRESS).updateOne(
    { _id: key },
    {
      $set: {
        progress_key: key,
        keyword: cleanKeyword,
        brand: String(brand || "").trim(),
        category_id: catId,
        type_id: type,
        last_page: page,
        updated_at: nowStamp(),
      },
    },
    { upsert: true },
  );
}

export async function upsertProducts(products) {
  const db = await getDb();
  const collection = db.collection(PRODUCTS);
  let inserted = 0;
  for (const p of products || []) {
    if (!p?.asin) continue;
    const existing = await collection.findOne({ asin: p.asin }, { projection: { image_urls: 1 } });
    const incomingImages = serialize(p.image_urls);
    const imageUrls = !existing || hasHttpImage(incomingImages) ? incomingImages : existing.image_urls;
    const fields = {
      asin: p.asin,
      amazon_url: p.amazon_url ?? null,
      name: p.name,
      feature_bullets: serialize(p.feature_bullets),
      product_category: p.product_category ?? null,
      price_inr: p.price_inr ?? null,
      original_price_inr: p.original_price_inr ?? null,
      rating: p.rating ?? null,
      total_reviews: p.total_reviews ?? null,
      image_urls: imageUrls,
      weight_grams: p.weight_grams ?? null,
      dimensions: p.dimensions ?? null,
      net_quantity: p.net_quantity ?? null,
      volume_ml: p.volume_ml ?? null,
      ingredients: p.ingredients ?? null,
      directions: p.directions ?? null,
      specifications: serialize(p.specifications),
      raw_product_info: serialize(p.raw_product_info),
      description: p.description ?? null,
      manufacturer: p.manufacturer ?? null,
      country_of_origin: p.country_of_origin ?? null,
      brand: p.brand ?? null,
      availability: p.availability ?? null,
      parent_asin: p.parent_asin ?? null,
      variant_type: p.variant_type ?? null,
      variant_value: p.variant_value ?? null,
      scrape_status: p.scrape_status ?? "enriched",
      updated_at: nowStamp(),
    };
    if (!existing) fields.scraped_at = p.scraped_at ?? nowStamp();
    await collection.updateOne(
      { asin: p.asin },
      { $set: fields, $setOnInsert: { _id: p.asin } },
      { upsert: true },
    );
    if (!existing) inserted += 1;
  }
  return inserted;
}

export async function fillMissingImages(products) {
  const db = await getDb();
  const collection = db.collection(PRODUCTS);
  let filled = 0;
  for (const product of products || []) {
    const incoming = Array.isArray(product?.image_urls)
      ? product.image_urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url))
      : [];
    if (!product?.asin || !incoming.length) continue;
    const row = await collection.findOne({ asin: product.asin }, { projection: { image_urls: 1 } });
    if (!row || hasHttpImage(row.image_urls)) continue;
    await collection.updateOne({ asin: product.asin }, { $set: { image_urls: JSON.stringify(incoming), updated_at: nowStamp() } });
    filled += 1;
  }
  return filled;
}

export async function getProducts({ status = null, limit = 1000, offset = 0 } = {}) {
  const db = await getDb();
  const filter = status ? { scrape_status: status } : {};
  const rows = await db.collection(PRODUCTS).find(filter).skip(offset).limit(limit).toArray();
  return rows.map(hydrateProduct);
}

export async function findProductsByKeyword(tokens, brand) {
  const words = (tokens || []).map((token) => String(token || "").trim()).filter((token) => token.length >= 2);
  if (!words.length) return [];
  const filter = {
    $and: words.map((token) => ({ name: { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } })),
  };
  if (brand) filter.brand = { $regex: String(brand).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const db = await getDb();
  const rows = await db.collection(PRODUCTS).find(filter).limit(200).toArray();
  return rows.map(hydrateProduct);
}

export async function getVariantChildren(parentAsin, limit = 5) {
  const db = await getDb();
  const rows = await db.collection(PRODUCTS)
    .find({ parent_asin: parentAsin, variant_type: { $ne: null } })
    .sort({ asin: 1 })
    .limit(limit)
    .toArray();
  return rows.map(hydrateProduct);
}

export async function getProductByAsin(asin) {
  const db = await getDb();
  const row = await db.collection(PRODUCTS).findOne({ asin });
  return hydrateProduct(row);
}

export async function countProducts() {
  const db = await getDb();
  return db.collection(PRODUCTS).countDocuments();
}

export async function getExistingAsins() {
  const db = await getDb();
  const rows = await db.collection(PRODUCTS).find({}, { projection: { asin: 1 } }).toArray();
  return new Set(rows.map((row) => row.asin));
}

export async function getCountryId(name) {
  const db = await getDb();
  const row = await db.collection(COUNTRIES).findOne({ name });
  return row?.ozon_id ?? 90312;
}

export async function upsertCountry(ozon_id, name) {
  const db = await getDb();
  await db.collection(COUNTRIES).updateOne(
    { _id: ozon_id },
    { $set: { ozon_id, name, fetched_at: nowStamp() } },
    { upsert: true },
  );
}

export async function dbStats() {
  const db = await getDb();
  const collection = db.collection(PRODUCTS);
  const [total, enriched, variants, parents] = await Promise.all([
    collection.countDocuments(),
    collection.countDocuments({ scrape_status: "enriched" }),
    collection.countDocuments({ variant_type: { $ne: null } }),
    collection.distinct("parent_asin", { parent_asin: { $ne: null } }),
  ]);
  return { total, enriched, variants, parents: parents.length, db_path: "mongodb" };
}

export async function isAlreadyUploaded(variantAsin) {
  const db = await getDb();
  return await db.collection(UPLOADS).findOne({ variant_asin: variantAsin });
}

export async function markAsUploaded(variantAsin, parentAsin, ozonTaskId) {
  const db = await getDb();
  await db.collection(UPLOADS).updateOne(
    { variant_asin: variantAsin },
    {
      $set: {
        variant_asin: variantAsin,
        parent_asin: parentAsin ?? null,
        ozon_task_id: ozonTaskId ?? null,
        status: "SUCCESS",
        uploaded_at: nowStamp(),
      },
      $setOnInsert: { _id: variantAsin },
    },
    { upsert: true },
  );
}

export async function uploadStats() {
  const db = await getDb();
  const collection = db.collection(UPLOADS);
  const today = nowStamp().slice(0, 10);
  const [total, uploadedToday] = await Promise.all([
    collection.countDocuments(),
    collection.countDocuments({ uploaded_at: { $regex: `^${today}` } }),
  ]);
  return { total_ever: total, uploaded_today: uploadedToday };
}

export async function closeCatalogDb() {
  if (!clientPromise) return;
  const db = await clientPromise;
  await db.client.close();
  clientPromise = null;
}

if (import.meta.main) {
  const stats = await dbStats();
  console.log("=== m-local-db.js — MongoDB catalog ===");
  console.log(`  Store        : ${stats.db_path}`);
  console.log(`  Total rows   : ${stats.total}`);
  console.log(`  Enriched     : ${stats.enriched}`);
  console.log(`  Variants     : ${stats.variants}`);
  console.log(`  Parent groups: ${stats.parents}`);
  await closeCatalogDb();
}
