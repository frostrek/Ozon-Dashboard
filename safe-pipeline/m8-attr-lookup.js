#!/usr/bin/env bun

/**
 * M8 — Ozon attribute dictionary lookup
 *
 * Fetches valid dictionary values for a given attribute ID from Ozon.
 * Use this whenever you get error_attribute_values_out_of_range on a push.
 *
 * Most commonly needed for:
 *   attr 85   — Brand (Бренд)  ← special: global dictionary, not category-scoped
 *   attr 4389 — Country of origin
 *   attr 8229 — Product type
 *
 * NOTE on attr 85 (Brand): Ozon's brand dictionary is massive (50k+ entries)
 * and is NOT filtered by category. Always set SEARCH to the brand name you
 * want — otherwise it will page through the entire dictionary.
 *
 * Run:
 *   bun --env-file=.env m8-attr-lookup.js
 *
 * .env:
 *   OZON_CLIENT_ID=...
 *   OZON_API_KEY=...
 */

import { readFileSync } from "fs";

const conf           = JSON.parse(readFileSync("./l98.conf.json", "utf8"));
const OZON_CLIENT_ID = Bun.env.OZON_CLIENT_ID;
const OZON_API_KEY   = Bun.env.OZON_API_KEY;
const OZON_HOST      = "https://api-seller.ozon.ru";

const DESCRIPTION_CATEGORY_ID = conf.push.ozon_category.description_category_id;
const TYPE_ID                  = conf.push.ozon_category.type_id;

// ─── What to look up ──────────────────────────────────────────────────────────
// ATTR_ID: 85 = Brand, 4389 = Country of origin, 8229 = Product type
// SEARCH:  ALWAYS set this for attr 85 — brand dict has 50k+ entries.
//          Use the brand name exactly as it might appear on Ozon (e.g. "NIVEA", "CeraVe")

const ATTR_ID = 85;
const SEARCH  = "";   // ← set this! e.g. "NIVEA" or "CeraVe"
const LIMIT   = 5000; // Ozon's max per page — use max to minimise round trips

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
  if (!res.ok) throw new Error(`Ozon ${res.status} at ${path}:\n${text.slice(0, 500)}`);
  return JSON.parse(text);
}

// ─── Fetch values ─────────────────────────────────────────────────────────────

async function fetchValues(attrId, search = "") {
  const all = [];
  let lastValueId = 0;
  let page = 1;

  while (true) {
    const body = {
      description_category_id: DESCRIPTION_CATEGORY_ID,
      type_id:                 TYPE_ID,
      attribute_id:            attrId,
      language:                "RU",
      last_value_id:           lastValueId,
      limit:                   LIMIT,
    };
    if (search) body.value = search;

    process.stdout.write(`\r  Fetching page ${page}...`);
    const data   = await ozonPost("/v1/description-category/attribute/values", body);
    const values = data?.result ?? [];

    all.push(...values);

    if (values.length < LIMIT) break;           // last page
    lastValueId = values[values.length - 1].id;
    page++;
  }
  process.stdout.write("\n");

  return all;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!OZON_CLIENT_ID || !OZON_API_KEY) {
    console.error("Missing OZON_CLIENT_ID or OZON_API_KEY in .env");
    process.exit(1);
  }

  if (ATTR_ID === 85 && !SEARCH) {
    console.warn("⚠️  SEARCH is empty for attr 85 (Brand). The brand dictionary has 50k+ entries.");
    console.warn("   This will take a long time. Set SEARCH to the brand name you want.\n");
  }

  console.log(`=== M8 — Ozon Attribute Dictionary Lookup ===`);
  console.log(`Attribute ID   : ${ATTR_ID}`);
  console.log(`Category       : ${DESCRIPTION_CATEGORY_ID} | Type: ${TYPE_ID}`);
  console.log(`Search filter  : ${SEARCH || "(none)"}\n`);

  const values = await fetchValues(ATTR_ID, SEARCH);

  if (values.length === 0) {
    console.log("No values found. Try a different search term — spelling must match Ozon's dictionary.");
    console.log("Example: try 'Nivea' instead of 'NIVEA', or 'L Oreal' instead of 'L\\'Oreal'");
    process.exit(0);
  }

  console.log(`\nFound ${values.length} value(s):\n`);
  console.log("  dictionary_value_id  | value");
  console.log("  -------------------- | -----");
  values.forEach((v) =>
    console.log(`  ${String(v.id).padEnd(20)} | ${v.value}`),
  );

  console.log("\n─── Next step ────────────────────────────────────────────────");
  console.log("Copy the dictionary_value_id and add it to l98.conf.json:");
  console.log("");
  console.log('  "brand_dictionary": {');
  values.slice(0, 3).forEach((v) =>
    console.log(`    "${v.value}": ${v.id},`)
  );
  console.log("  }");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
