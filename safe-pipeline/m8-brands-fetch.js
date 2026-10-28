#!/usr/bin/env bun

/**
 * M8 — Brand/country lookup diagnostic
 *
 * Use this to manually check if a brand or country exists in Ozon's
 * dictionary before pushing. Useful for debugging attribute errors.
 *
 * m9-ozon-push.js handles all lookups automatically at push time —
 * you don't need to run this as part of the normal pipeline.
 *
 * Run:
 *   bun --env-file=.env m8-brands-fetch.js
 *
 * .env:
 *   OZON_CLIENT_ID=...
 *   OZON_API_KEY=...
 */

import { readFileSync } from "fs";

const conf = JSON.parse(readFileSync("./l98.conf.json", "utf8"));
const OZON_CLIENT_ID = Bun.env.OZON_CLIENT_ID;
const OZON_API_KEY = Bun.env.OZON_API_KEY;
const OZON_HOST = "https://api-seller.ozon.ru";

const DESCRIPTION_CATEGORY_ID = conf.push.ozon_category.description_category_id;
const TYPE_ID = conf.push.ozon_category.type_id;

// ─── What to look up ──────────────────────────────────────────────────────────
// ATTR_ID : 85 = Brand, 4389 = Country of origin, 8229 = Product type
// SEARCH  : name to search for

const ATTR_ID = 85;
const SEARCH = "Vaseline";   // ← change this

// ─────────────────────────────────────────────────────────────────────────────

async function ozonPost(path, body) {
  const res = await fetch(`${OZON_HOST}${path}`, {
    method: "POST",
    headers: {
      "Client-Id": OZON_CLIENT_ID,
      "Api-Key": OZON_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Ozon ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function main() {
  if (!OZON_CLIENT_ID || !OZON_API_KEY) {
    console.error("Missing OZON_CLIENT_ID or OZON_API_KEY in .env");
    process.exit(1);
  }

  console.log(`=== M8 — Ozon Dictionary Lookup ===`);
  console.log(`Attr: ${ATTR_ID} | Search: "${SEARCH}"\n`);

  const data = await ozonPost("/v1/description-category/attribute/values", {
    description_category_id: DESCRIPTION_CATEGORY_ID,
    type_id: TYPE_ID,
    attribute_id: ATTR_ID,
    language: "RU",
    last_value_id: 0,
    limit: 50,
    value: SEARCH,
  });

  const values = data?.result ?? [];
  if (values.length === 0) {
    console.log("No results found. Try a different spelling.");
    return;
  }

  console.log(`Found ${values.length} result(s):\n`);
  console.log("  ozon_id              | value");
  console.log("  -------------------- | -----");
  values.forEach((v) => console.log(`  ${String(v.id).padEnd(20)} | ${v.value}`));
  console.log("\nNote: m9-ozon-push.js will find and store this automatically at push time.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});