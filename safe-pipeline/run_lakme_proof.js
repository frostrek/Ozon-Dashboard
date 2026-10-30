/**
 * run_lakme_proof.js — 5 Lakme Product Dry-Run with full payload inspection
 */

import { pushProductToOzon } from "./m9-ozon-push.js";
import { fetchInrUsdRate }   from "./m7-pricing.js";
import { getProducts }       from "./m-local-db.js";
import { readFileSync }      from "fs";

const conf      = JSON.parse(readFileSync("./l98.conf.json", "utf8"));
const CAT_ID    = conf?.push?.ozon_category?.description_category_id ?? 17028991;
const TYPE_ID   = conf?.push?.ozon_category?.type_id                 ?? 629618165;
const LABEL     = conf?.push?.ozon_category?.type_label              ?? "Sunscreen";
const OLD_MULT  = conf?.push?.pricing?.old_price_multiplier          ?? 2.0;

// ─── DRY-RUN intercept ───────────────────────────────────────────────────────
const origFetch = globalThis.fetch;
const results   = [];
globalThis.fetch = async (url, init) => {
  if (typeof url === "string" && url.includes("api-seller.ozon.ru") && url.includes("/v3/product/import")) {
    const body = init?.body ? JSON.parse(init.body) : null;
    for (const item of (body?.items ?? [])) {
      const brand   = item.attributes?.find(a => a.id === 85)?.values?.[0];
      const color   = item.attributes?.find(a => a.id === 10096)?.values?.[0];
      const shade   = item.attributes?.find(a => a.id === 10097)?.values?.[0];
      results.push({
        asin:        item.offer_id,
        ru_title:    item.name,
        brand_value: brand?.value ?? "N/A",
        brand_id:    brand?.dictionary_value_id ?? "N/A",
        color_value: color?.value ?? "N/A",
        color_id:    color?.dictionary_value_id ?? "N/A",
        shade_value: shade?.value ?? "N/A",
      });
    }
    return new Response(JSON.stringify({ result: { task_id: "DRY_RUN_12345" } }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  }
  return origFetch(url, init);
};

async function main() {
  console.log("\x1b[1m\x1b[35m=== LAKME SHADE — 5-PRODUCT PROOF RUN ===\x1b[0m\n");

  const all = await getProducts({ status: "enriched", limit: 2000 });

  // Get 5 fresh Lakme shades
  const lakmePdps = all.filter(p => {
    const b = (p.brand || "").toLowerCase();
    return b.includes("lakm") && p.variant_type && p.variant_value;
  }).slice(0, 5);

  const rate    = await fetchInrUsdRate();
  const options = {
    descriptionCategoryId: CAT_ID,
    typeId: TYPE_ID,
    typeLabel: LABEL,
    oldPriceMultiplier: OLD_MULT,
    skipDuplicateCheck: true   // bypass for proof
  };

  for (const p of lakmePdps) {
    try {
      await pushProductToOzon(p, rate, options);
    } catch (err) { }
  }

  console.log("\n\x1b[1m\x1b[35m╔══════════════ 5-PRODUCT PROOF TABLE ══════════════╗\x1b[0m");
  for (const r of results) {
    console.log(`\n  ASIN             : ${r.asin}`);
    console.log(`  Color/10096 Dict : ${r.color_value} (ID: ${r.color_id})`);
    console.log(`  Shade/10097 Text : ${r.shade_value}`);
  }
  console.log("\n\x1b[1m\x1b[35m╚═══════════════════════════════════════════════════╝\x1b[0m");
}

main().catch(err => { console.error("\x1b[31m FATAL:", err.message, "\x1b[0m"); process.exit(1); });
