#!/usr/bin/env bun

/**
 * M-VARIANT-GROUP — Cosmetic Shade Variant Group Pusher
 *
 * Reads all shade children for a given parent ASIN from Supabase,
 * runs each one through pushProductToOzon(), and produces a summary.
 *
 * Usage:
 *   bun --env-file=.env m-variant-group.js --parent-asin B0179XU0V8 \
 *       --category-id 17028698 --type-id 95911 --type-label "Тональный крем"
 *
 * Config (l98.conf.json):
 *   max_variants: 5   (default, respects MAX_VARIANTS from scraper)
 *
 * Requirements:
 *   - Products must have been scraped with variant support (m1-m3-scraper.js).
 *   - parent_asin, variant_type, variant_value columns must exist in DB (m4-schema.sql migration).
 *   - OZON_CLIENT_ID, OZON_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY in .env
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { getVariantChildren, getProductByAsin } from "./m-local-db.js";
import { pushProductToOzon } from "./m9-ozon-push.js";
import { fetchInrUsdRate } from "./m7-pricing.js";

// ─── Config ───────────────────────────────────────────────────────────────────

let conf = {};
try { conf = JSON.parse(readFileSync("./l98.conf.json", "utf8")); } catch {}

const MAX_VARIANTS = conf?.scraper?.max_variants || 5;

const SUPABASE_URL = (Bun.env.SUPABASE_URL ?? "").trim();
const SUPABASE_KEY = (Bun.env.SUPABASE_SERVICE_KEY ?? "").trim();
const supabaseAvailable = !!(SUPABASE_URL && SUPABASE_KEY);


// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch all shade children for a parent ASIN.
 * Try local SQLite first → fall back to Supabase if needed.
 */
async function fetchVariantChildren(parentAsin, limit = MAX_VARIANTS) {
  // 1. Try local SQLite (always available, even when Supabase quota exceeded)
  const localRows = await getVariantChildren(parentAsin, limit);
  if (localRows.length > 0) {
    console.log(`  📦 Loaded ${localRows.length} shade(s) from local SQLite.`);
    return localRows;
  }

  // 2. Fallback: Supabase (if credentials available)
  if (supabaseAvailable) {
    console.warn(`  ⚠️  No rows in local SQLite for parent ${parentAsin}. Trying Supabase...`);
    try {
      const { data: children, error } = await createClient(SUPABASE_URL, SUPABASE_KEY)
        .from("products")
        .select("*")
        .eq("parent_asin", parentAsin)
        .not("variant_type", "is", null)
        .order("asin", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      if (children?.length > 0) {
        console.log(`  ☁️  Loaded ${children.length} shade(s) from Supabase.`);
        return children;
      }
    } catch (e) {
      console.warn(`  ⚠️  Supabase fetch failed: ${e.message}`);
    }
  }

  // 3. Last resort: try parent ASIN directly from SQLite
  console.warn(`  ⚠️  No shade children found anywhere for ${parentAsin}. Trying parent itself.`);
  const parent = await getProductByAsin(parentAsin);
  if (parent) return [parent];

  throw new Error(`Parent ASIN ${parentAsin} not found in local SQLite or Supabase.`);
}

/**
 * Fetch the exchange rate, retrying up to 3 times.
 */
async function getRate() {
  for (let i = 0; i < 3; i++) {
    try { return await fetchInrUsdRate(); } catch {}
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error("Could not fetch INR/USD rate after 3 attempts.");
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Push all shade variants of `parentAsin` to Ozon as a linked group.
 *
 * @param {string}  parentAsin          - The Amazon parent ASIN
 * @param {object}  ozonOptions         - { descriptionCategoryId, typeId, typeLabel, oldPriceMultiplier }
 * @param {number}  [limit=MAX_VARIANTS] - Max children to push
 * @returns {{ pushed: number, failed: number, results: Array }}
 */
export async function pushVariantGroup(parentAsin, ozonOptions, limit = MAX_VARIANTS) {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  M-VARIANT-GROUP — Shade Push                        ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  Parent ASIN : ${parentAsin}`);
  console.log(`  Category ID  : ${ozonOptions.descriptionCategoryId}`);
  console.log(`  Type Label   : ${ozonOptions.typeLabel}`);
  console.log(`  Max variants : ${limit}\n`);

  // 1. Fetch children
  const children = await fetchVariantChildren(parentAsin, limit);
  console.log(`  Found ${children.length} shade variant(s) to push.\n`);

  // 2. Exchange rate
  const inrUsdRate = await getRate();
  console.log(`  INR/USD rate : ${inrUsdRate}\n`);

  // 3. Push each child
  const results = [];
  let pushed = 0;
  let failed = 0;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const shade = child.variant_value || "shade " + (i + 1);
    console.log(`\n──────────────────────────────────────────────────────`);
    console.log(`  [${i + 1}/${children.length}] Pushing shade: "${shade}" (ASIN: ${child.asin})`);
    console.log(`──────────────────────────────────────────────────────`);

    try {
      const result = await pushProductToOzon(child, inrUsdRate, ozonOptions);
      results.push({ asin: child.asin, shade, ...result });
      if (result.success) {
        pushed++;
        console.log(`  ✅ Success  — Task ID: ${result.taskId}`);
      } else {
        failed++;
        console.log(`  ❌ Failed   — ${result.error}`);
      }
    } catch (err) {
      failed++;
      results.push({ asin: child.asin, shade, success: false, error: err.message });
      console.log(`  ❌ Exception — ${err.message}`);
    }

    // Brief cooldown between pushes to avoid Ozon rate limits
    if (i < children.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 4. Summary
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  VARIANT GROUP PUSH SUMMARY                          ║`);
  console.log(`╠══════════════════════════════════════════════════════╣`);
  console.log(`║  Parent ASIN : ${parentAsin.padEnd(37)}║`);
  console.log(`║  Total shades: ${String(children.length).padEnd(37)}║`);
  console.log(`║  ✅ Pushed   : ${String(pushed).padEnd(37)}║`);
  console.log(`║  ❌ Failed   : ${String(failed).padEnd(37)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  // 5. Save report
  try {
    const dir = "./upload-reports";
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/variant-group-${parentAsin}.json`,
      JSON.stringify({ parentAsin, pushed, failed, results }, null, 2)
    );
    console.log(`  📝 Group report → upload-reports/variant-group-${parentAsin}.json`);
  } catch {}

  return { pushed, failed, results };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const argMap = {};
  for (let i = 0; i < args.length; i += 2) {
    if (args[i].startsWith("--")) argMap[args[i].slice(2)] = args[i + 1];
  }

  const parentAsin = argMap["parent-asin"];
  if (!parentAsin) {
    console.error("Usage: bun m-variant-group.js --parent-asin ASIN --category-id ID --type-id ID --type-label \"Label\"");
    process.exit(1);
  }

  const ozonOptions = {
    descriptionCategoryId: argMap["category-id"] || "17028698",
    typeId:                 argMap["type-id"]     || "95911",
    typeLabel:              argMap["type-label"]  || "Косметика",
    oldPriceMultiplier:     parseFloat(argMap["old-price-multiplier"] || "1.4"),
  };

  const limit = parseInt(argMap["max-variants"] || String(MAX_VARIANTS), 10);

  pushVariantGroup(parentAsin, ozonOptions, limit).catch(err => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}
