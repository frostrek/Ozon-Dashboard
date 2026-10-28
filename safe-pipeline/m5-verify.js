#!/usr/bin/env bun

/**
 * M5 — DB health check
 *
 * Verifies all tables exist, shows row counts, samples key rows.
 * Run any time to confirm DB state.
 *
 * Run:
 *   bun --env-file=.env m5-verify.js
 */

const SUPABASE_URL = Bun.env.SUPABASE_URL;
const SUPABASE_KEY = Bun.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

async function checkTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer:        "count=exact",
    },
  });
  const count = res.headers.get("content-range")?.split("/")?.[1] ?? "?";
  const data  = await res.json();
  return { ok: res.ok, count, data };
}

async function main() {
  console.log("=== M5 — DB Health Check ===\n");

  // ─── Core tables ──────────────────────────────────────────────────────────
  const core = ["products", "ozon_accounts", "product_listings", "scrape_jobs", "exchange_rates"];
  for (const table of core) {
    const { ok, count, data } = await checkTable(table);
    if (ok) {
      console.log(`  ✅ ${table.padEnd(22)} rows: ${count}`);
      if (table === "products" && Array.isArray(data) && data.length > 0) {
        const r = data[0];
        console.log(`     Sample: ${r.asin} | ${r.brand} | ${r.name?.slice(0, 35)} | ₹${r.price_inr}`);
      }
    } else {
      console.log(`  ❌ ${table.padEnd(22)} ERROR: ${JSON.stringify(data).slice(0, 100)}`);
    }
  }

  // ─── Ozon dictionary tables ───────────────────────────────────────────────
  console.log();
  const { ok: bOk, count: bCount, data: bData } = await checkTable("ozon_brands");
  if (bOk) {
    const note = parseInt(bCount) === 0
      ? "⚠️  Empty — run m8-brands-fetch.js"
      : "✅";
    console.log(`  ${note} ${"ozon_brands".padEnd(22)} rows: ${bCount}`);
  } else {
    console.log(`  ❌ ${"ozon_brands".padEnd(22)} ERROR — table missing? Re-run m4-schema.sql`);
  }

  const { ok: cOk, count: cCount, data: cData } = await checkTable("ozon_countries");
  if (cOk) {
    const note = parseInt(cCount) === 0
      ? "⚠️  Empty — run m5b-countries-sync.js"
      : "✅";
    console.log(`  ${note} ${"ozon_countries".padEnd(22)} rows: ${cCount}`);
    if (Array.isArray(cData) && cData.length > 0) {
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/ozon_countries?select=ozon_id,name`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      const all = await res2.json();
      all.forEach((r) => console.log(`     ${String(r.ozon_id).padEnd(12)} | ${r.name}`));
    }
  } else {
    console.log(`  ❌ ${"ozon_countries".padEnd(22)} ERROR — table missing? Re-run m4-schema.sql`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
