#!/usr/bin/env bun

/**
 * M5b — Countries sync (Fixed: Known IDs for Korea/Somalia)
 */

import { readFileSync } from "fs";
import { translateStrings } from "./m6-translate.js";

let conf = {}; try { conf = JSON.parse(readFileSync("./l98.conf.json", "utf8")); } catch (e) {}
const SUPABASE_URL = Bun.env.SUPABASE_URL;
const SUPABASE_KEY = Bun.env.SUPABASE_SERVICE_KEY;
const OZON_CLIENT_ID = Bun.env.OZON_CLIENT_ID;
const OZON_API_KEY = Bun.env.OZON_API_KEY;
const OZON_HOST = "https://api-seller.ozon.ru";

if (!SUPABASE_URL || !SUPABASE_KEY || !OZON_CLIENT_ID || !OZON_API_KEY) {
  console.error("Missing credentials in .env");
  process.exit(1);
}

async function ozonPost(path, body) {
  const res = await fetch(`${OZON_HOST}${path}`, {
    method: "POST", headers: { "Client-Id": OZON_CLIENT_ID, "Api-Key": OZON_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return JSON.parse(text);
}

async function sbPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(body),
  });
}

// ─── Known country IDs (Hardcoded to fix sync failures) ─────────────────────
const KNOWN_COUNTRY_IDS = {
  "India":             { id: 90312 },
  "Republic of Korea": { id: 90325 },
  "South Korea":       { id: 90325 },
  "Somalia":           { id: 90352 },
  "Spain":             { id: 90302 },
  "France":            { id: 90304 },
  "Thailand":          { id: 90328 },
  "Germany":           { id: 90300 },
  "Canada":            { id: 90306 },
  "USA":               { id: 90293 },
  "USA ":              { id: 90293 },
  "United States":     { id: 90293 },
};

export async function syncCountries(catId = 17028992, typeId = 93945) {
  console.log("=== M5b — Countries Sync (Hardened) ===");

  let products = [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=country_of_origin`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error("Supabase read failed");
    products = await res.json();
  } catch (e) {
    console.warn(`  ⚠️ Could not fetch products from DB for country sync (Quota exceeded?). Skipping sync.`);
    return;
  }
  const allEn = [...new Set(products.map(p => p.country_of_origin).filter(Boolean))];

  let existing = new Set();
  try {
    const exRes = await fetch(`${SUPABASE_URL}/rest/v1/ozon_countries?select=name`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (exRes.ok) {
      existing = new Set((await exRes.json()).map(r => r.name));
    }
  } catch (e) {}

  const missing = allEn.filter(c => !existing.has(c));
  if (!missing.length) { console.log("✅ All countries synced."); return; }

  const translated = await translateStrings(missing);
  const toInsert = [];

  for (let i = 0; i < missing.length; i++) {
    const en = missing[i];
    const ru = translated[i];
    
    if (KNOWN_COUNTRY_IDS[en]) {
      toInsert.push({ ozon_id: KNOWN_COUNTRY_IDS[en].id, name: en });
      console.log(`  ✅ Hardcoded: "${en}" → ID ${KNOWN_COUNTRY_IDS[en].id}`);
      continue;
    }

    const data = await ozonPost("/v1/description-category/attribute/values", {
      description_category_id: catId, type_id: typeId, attribute_id: 4389, language: "RU", value: ru, limit: 5
    });
    const match = (data?.result ?? []).find(v => v.value.toLowerCase() === ru.toLowerCase()) || data?.result?.[0];
    
    if (match) {
      toInsert.push({ ozon_id: match.id, name: en });
      console.log(`  ✅ Ozon API: "${en}" (${ru}) → ID ${match.id}`);
    } else {
      console.log(`  ⚠️ Could not find ID for: "${en}" (${ru})`);
    }
  }

  if (toInsert.length > 0) {
    try {
      await sbPost("ozon_countries", toInsert);
      console.log(`\n✅ Stored ${toInsert.length} new records.`);
    } catch (e) {
      console.log(`\n⚠️ Failed to store country records (Supabase restricted)`);
    }
  }
}

if (import.meta.main) { syncCountries().catch(err => console.error(err)); }