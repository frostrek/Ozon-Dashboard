#!/usr/bin/env bun

/**
 * Debug brand dictionary: see what values Ozon has for attribute 85 (Brand)
 * in category 17028991 and check if "The Derma Co" can be found.
 */

const OZON_CLIENT_ID = (Bun.env.OZON_CLIENT_ID ?? "").trim();
const OZON_API_KEY = (Bun.env.OZON_API_KEY ?? "").trim();

async function ozonPost(path, body) {
  const res = await fetch(`https://api-seller.ozon.ru${path}`, {
    method: "POST",
    headers: { "Client-Id": OZON_CLIENT_ID, "Api-Key": OZON_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function debug() {
  const search = "derma";
  console.log(`\n🔍 Searching brand dictionary for: "${search}"`);
  
  let offset = 0;
  let found = [];
  while (true) {
    const data = await ozonPost("/v1/description-category/attribute/values", {
      description_category_id: 17028991,
      type_id: 93897,
      attribute_id: 85,
      language: "RU",
      limit: 100,
      last_value_id: offset
    });
    
    const items = data?.result ?? [];
    if (items.length === 0) break;
    
    const matches = items.filter(o => o.value.toLowerCase().includes(search));
    found.push(...matches);
    offset = items[items.length - 1].id;
    
    if (items.length < 100) break;
  }
  
  console.log(`\nFound ${found.length} brand(s) matching "${search}":`);
  found.forEach(b => console.log(`  ID: ${b.id} → "${b.value}"`));
  
  if (found.length === 0) {
    console.log("\n⚠️ Brand not in Ozon dictionary. Will use 'Нет бренда'.");
    console.log("   This means ALL brands not in the dictionary will get 'Нет бренда'.");
    console.log("   This is correct Ozon behavior and NOT a bug.");
  }
}

debug();
