#!/usr/bin/env bun

/**
 * M7 — INR → USD pricing
 *
 * Exports: getMultiplier(priceInr), fetchInrUsdRate(), computeUsdPrice(priceInr, rate)
 *
 * Run standalone to verify tier table:
 *   bun m7-pricing.js
 */

// ─── Tiered multiplier table ──────────────────────────────────────────────────

const TIERS = [
  { max: 50,       multiplier: 20  },
  { max: 100,      multiplier: 15  },
  { max: 150,      multiplier: 13  },
  { max: 200,      multiplier: 12  },
  { max: 250,      multiplier: 10  },
  { max: 300,      multiplier: 9   },
  { max: 350,      multiplier: 8   },
  { max: 400,      multiplier: 7.5 },
  { max: 450,      multiplier: 7   },
  { max: 500,      multiplier: 6.5 },
  { max: 550,      multiplier: 6   },
  { max: 600,      multiplier: 5.7 },
  { max: 700,      multiplier: 5.5 },
  { max: Infinity, multiplier: 5   },
];

export function getMultiplier(priceInr) {
  return (TIERS.find((t) => priceInr <= t.max) ?? { multiplier: 5 }).multiplier;
}

// ─── Live INR → USD rate ──────────────────────────────────────────────────────

export async function fetchInrUsdRate() {
  const urls = [
    "https://api.exchangerate-api.com/v4/latest/INR",
    "https://open.er-api.com/v6/latest/INR",
  ];
  let lastError = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Exchange rate fetch failed: HTTP ${res.status}`);
      const data = await res.json();
      const rate = data?.rates?.USD;
      if (!rate) throw new Error("USD rate not found in exchange rate response");
      return rate;
    } catch (error) {
      lastError = error;
    }
  }
  if (/timed out/i.test(lastError?.message || lastError?.name || "")) {
    throw new Error("The exchange rate service did not answer in time. Nothing was pushed. Try again.");
  }
  throw lastError || new Error("The exchange rate could not be loaded.");
}

// ─── Compute USD price ────────────────────────────────────────────────────────
// priceInr   — numeric INR price
// inrUsdRate — from fetchInrUsdRate() (e.g. 0.01071)

export function computeUsdPrice(priceInr, inrUsdRate) {
  return Math.round(priceInr * getMultiplier(priceInr) * inrUsdRate * 100) / 100;
}

// ─── Standalone test ──────────────────────────────────────────────────────────

if (import.meta.main) {
  console.log("=== M7 — INR → USD Pricing ===\n");

  console.log("Fetching live INR → USD rate...");
  const rate = await fetchInrUsdRate();
  console.log(`  1 INR = ${rate} USD  (1 USD = ₹${(1 / rate).toFixed(2)})\n`);

  console.log("--- Tier table ---");
  const testPrices = [25, 75, 125, 175, 225, 275, 325, 375, 425, 475, 525, 575, 650, 800];
  testPrices.forEach((inr) => {
    const mult = getMultiplier(inr);
    const usd  = computeUsdPrice(inr, rate);
    console.log(`  ₹${String(inr).padEnd(6)} × ${String(mult).padEnd(5)} = $${usd.toFixed(2)}`);
  });

  const file = Bun.file("m1-m3-output.json");
  if (await file.exists()) {
    console.log("\n--- Real products ---");
    const products = await file.json();
    products.slice(0, 8).forEach((p) => {
      if (!p.price_inr) return;
      const usd = computeUsdPrice(p.price_inr, rate);
      console.log(
        `  ₹${String(p.price_inr).padEnd(6)} × ${String(getMultiplier(p.price_inr)).padEnd(5)} = $${usd.toFixed(2).padEnd(8)} | ${p.name?.slice(0, 45)}`,
      );
    });
  }

  console.log("\n=== Checklist ===");
  console.log("  [ ] Exchange rate fetched successfully");
  console.log("  [ ] Multipliers match the pricing table in README");
  console.log("  [ ] USD prices look reasonable (not too low, not too high)");
  console.log("\nIf all pass -> ready for m9-ozon-push.js");
}
