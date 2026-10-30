#!/usr/bin/env bun

// Fix for Windows console encoding (UTF-8)
if (process.platform === "win32") {
  try {
    const { execSync } = require("child_process");
    execSync("chcp 65001", { stdio: "ignore" });
  } catch (e) {}
}

import { intro, outro, text, select, spinner, confirm, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import Table from 'cli-table3';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, appendFileSync, statSync } from "fs";
import * as path from "path";


import { runScraper } from './m1-m3-scraper.js';
import { insertProductsToDb, cleanProduct } from './m5-insert.js';
import { syncCountries } from './m5b-countries-sync.js';
import { translateProduct, translateStrings } from './m6-translate.js';
import { fetchInrUsdRate, computeUsdPrice } from './m7-pricing.js';
import { pushProductToOzon, ozonPost } from "./m9-ozon-push.js";

async function showRecentProductStatus() {
    console.log(pc.cyan("\n--- Recent Ozon Product Status ---"));
    try {
        const res = await ozonPost("/v3/product/list", { filter: { visibility: "ALL" }, limit: 5 });
        let resParsed = {};
        try {
            resParsed = JSON.parse(res.text ?? "{}");
        } catch (e) {
            console.log(pc.red(`  ⚠️ Could not parse Ozon list: ${res.text?.slice(0, 100)}`));
            return;
        }

        if (res.ok && resParsed?.result?.items?.length > 0) {
            const ids = resParsed.result.items.map(i => i.product_id);
            const info = await ozonPost("/v3/product/info/list", { product_id: ids });
            let infoParsed = {};
            try {
                infoParsed = JSON.parse(info.text ?? "{}");
            } catch (e) {
                console.log(pc.red(`  ⚠️ Could not parse Ozon info: ${info.text?.slice(0, 100)}`));
                return;
            }

            if (info.ok && infoParsed?.result?.items) {
                infoParsed.result.items.forEach(item => {
                    const status = item.status?.state_name || "Unknown";
                    const color = status.includes("Moderating") ? pc.yellow : status.includes("Active") ? pc.green : pc.red;
                    console.log(`  • ${pc.bold(item.offer_id)} [${item.name.slice(0, 30)}...] -> ${color(status)}`);
                    if (item.status?.reasons?.length > 0) {
                        console.log(pc.red(`    ⚠️ Error: ${item.status.reasons[0].description}`));
                    }
                });
            }
        } else {
            console.log(pc.dim("  No recent products found on Ozon."));
        }
    } catch (e) {
        console.log(pc.red(`  ⚠️ Could not fetch Ozon status: ${e.message}`));
    }
    console.log(pc.cyan("----------------------------------\n"));
}

const SUPABASE_URL = Bun.env.SUPABASE_URL;
const SUPABASE_KEY = Bun.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CATEGORIES = [
  { value: { catId: 17028991, typeId: 629618165, label: "Sunscreen" }, label: '🧴 Sunscreen' },
  { value: { catId: 17028991, typeId: 93897, label: "Face Wash" }, label: '🧼 Face Wash' },
  { value: { catId: 17028992, typeId: 93945, label: "Hair Serum" }, label: '💧 Hair Serum' },
  { value: { catId: 15621050, typeId: 95139, label: "Smartphone" }, label: '📱 Smartphone' },
  { value: 'SEARCH', label: '🔍 Search Ozon Categories (API)...' },
  { value: 'CUSTOM', label: '🛠️  Enter Custom IDs manually...' },
];

function flattenOzonTree(nodes, currentDescCatId = null, currentPath = "") {
  let results = [];
  if (!Array.isArray(nodes)) return results;
  for (const node of nodes) {
    if (node.disabled) continue;
    const descId = node.description_category_id || currentDescCatId;
    const name = node.category_name || node.type_name || "Unknown";
    const path = currentPath ? `${currentPath} > ${name}` : name;
    if (node.type_id) {
      results.push({ catId: descId, typeId: node.type_id, label: path, searchBase: path.toLowerCase() });
    }
    if (node.children && node.children.length > 0) {
      results.push(...flattenOzonTree(node.children, descId, path));
    }
  }
  return results;
}

async function main() {
  console.clear();
  intro(pc.magenta(' L98 Pipeline — Interactive Shell '));
  
  // --- Supabase Health Check ---
  let DB_ENABLED = true;
  try {
    const { error } = await supabase.from('products').select('asin').limit(1);
    if (error) {
      if (error.message?.includes('exceed_storage_size_quota') || error.code === '402') {
        console.warn(pc.yellow(`\n  ⚠️  Supabase Quota Exceeded. Switching to [Direct-to-Ozon] mode (No DB).`));
        DB_ENABLED = false;
      } else if (error.message?.includes('Invalid API key') || error.code === '401') {
        console.warn(pc.yellow(`\n  ⚠️  Supabase Auth Error. Switching to [Direct-to-Ozon] mode (No DB).`));
        DB_ENABLED = false;
      }
    }
  } catch (e) {
    console.warn(pc.yellow(`\n  ⚠️  Supabase Connection Failed. Switching to [Direct-to-Ozon] mode (No DB).`));
    DB_ENABLED = false;
  }
  
  if (DB_ENABLED) {
    await showRecentProductStatus();
  } else {
    console.log(pc.cyan("  🚀 Direct-to-Ozon mode active: Database errors will be bypassed.\n"));
  }

  // 1. Config Phase
  const kwInput = await text({ message: 'Category to scrape (e.g. "Serum", "Face Wash")', placeholder: 'sunscreen', initialValue: 'sunscreen' });
  if (isCancel(kwInput)) process.exit(0);
  const baseKeyword = kwInput.trim();

  const brandInput = await text({ message: 'Optional Brand filter? (Press Enter for all brands)', placeholder: 'e.g. L\'Oreal, Minimalist' });
  if (isCancel(brandInput)) process.exit(0);
  const brand = brandInput.trim();

  // Define the master search keyword for Amazon
  const keyword = (brand ? `${brand} ${baseKeyword}` : baseKeyword).toLowerCase().trim();

  let category = await select({ message: 'Ozon Category to push to', options: CATEGORIES });
  if (isCancel(category)) process.exit(0);

  if (category === 'SEARCH') {
    while (true) {
        const searchKw = await text({ message: 'Enter Ozon category keyword (e.g. "Face Cream" or "Крем"): ' });
        if (isCancel(searchKw)) process.exit(0);

        const sSpinner = spinner();
        sSpinner.start('Translating search term and fetching Ozon category trees...');
        
        let ruKw = searchKw;
        try {
          const trans = await translateStrings([searchKw]);
          if (trans && trans[0]) ruKw = trans[0];
        } catch (e) {
          console.log(pc.yellow(`  ⚠️ Translation failed, using English only.`));
        }

        const termEn = searchKw.toLowerCase();
        const termRu = ruKw.toLowerCase();

        // 2a. Fetch Ozon Tree (v40 Unified Cache Hardened)
        let flatEn = [];
        let flatRu = [];
        const CACHE_FILE_EN = "ozon-tree-en-cache.json";
        const CACHE_FILE_RU = "ozon-tree-ru-cache.json";
        const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

        const isCacheValid = (file) => {
            if (!existsSync(file)) return false;
            const stats = statSync(file);
            return (Date.now() - stats.mtimeMs) < CACHE_MAX_AGE;
        };

        try {
          if (isCacheValid(CACHE_FILE_EN)) {
            flatEn = JSON.parse(readFileSync(CACHE_FILE_EN, "utf8"));
          } else {
            const resEn = await fetch("https://api-seller.ozon.ru/v1/description-category/tree", {
              method: "POST",
              headers: { "Client-Id": Bun.env.OZON_CLIENT_ID, "Api-Key": Bun.env.OZON_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ language: "EN" })
            });
            if (!resEn.ok) throw new Error(`HTTP ${resEn.status}`);
            const dataEn = await resEn.json();
            flatEn = flattenOzonTree(dataEn.result || []);
            if (flatEn.length > 0) writeFileSync(CACHE_FILE_EN, JSON.stringify(flatEn));
          }
          
          if (isCacheValid(CACHE_FILE_RU)) {
            flatRu = JSON.parse(readFileSync(CACHE_FILE_RU, "utf8"));
          } else {
            const resRu = await fetch("https://api-seller.ozon.ru/v1/description-category/tree", {
              method: "POST",
              headers: { "Client-Id": Bun.env.OZON_CLIENT_ID, "Api-Key": Bun.env.OZON_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ language: "RU" })
            });
            if (resRu.ok) {
              const dataRu = await resRu.json();
              flatRu = flattenOzonTree(dataRu.result || []);
              if (flatRu.length > 0) writeFileSync(CACHE_FILE_RU, JSON.stringify(flatRu));
            } else {
               const errText = await resRu.text();
               console.log(pc.yellow(`  ⚠️ Russian tree fetch failed: ${resRu.status} ${errText.slice(0, 50)}`));
            }
          }
        } catch (e) {
          sSpinner.stop(pc.red(`❌ Ozon API Error: ${e.message}`));
          const tryAgain = await select({ message: "Ozon Tree Fetch Failed. Try again?", options: [{value: 'YES', label: 'Yes, try again'}, {value: 'NO', label: 'No, exit'}]});
          if (tryAgain !== 'YES') process.exit(1);
          // Loop will naturally continue
        }

        // --- Total Hardening Search Engine (v23 Optimized) ---
        const combinedMap = new Map();
        const searchWordsEn = termEn.split(/\s+/).filter(w => w.length >= 2);
        const searchWordsRu = termRu.split(/\s+/).filter(w => w.length >= 2);

        const scoreCategoryMatch = (label, searchWords) => {
          const l = label.toLowerCase();
          let matchedCount = 0;
          for (const w of searchWords) {
            if (l.includes(w)) matchedCount++;
          }
          return matchedCount;
        };

        // STAGE 1: Direct Substring matching
        flatEn.filter(c => c.searchBase.includes(termEn)).forEach(m => combinedMap.set(m.label, m));
        flatRu.filter(c => c.searchBase.includes(termRu)).forEach(m => combinedMap.set(m.label, m));

        // STAGE 2: Multi-Word Matching & Scoring
        if (combinedMap.size < 5) {
          const candidates = [...flatEn, ...flatRu];
          const scored = candidates.map(c => {
            const scoreEn = scoreCategoryMatch(c.label, searchWordsEn);
            const scoreRu = scoreCategoryMatch(c.label, searchWordsRu);
            return { ...c, score: Math.max(scoreEn, scoreRu) };
          }).filter(c => c.score > 0);

          scored.sort((a, b) => b.score - a.score);
          scored.slice(0, 100).forEach(m => combinedMap.set(m.label, m));
        }

        // STAGE 3: Broad Fallback (First Word)
        if (combinedMap.size === 0 && searchWordsEn.length > 0) {
            const fallbackWord = searchWordsEn[0];
            console.log(pc.yellow(`  ⚠️ No match for full term, trying fallback search for "${fallbackWord}"...`));
            const broadMatches = [...flatEn, ...flatRu].filter(c => c.searchBase.includes(fallbackWord));
            broadMatches.forEach(m => combinedMap.set(m.label, m));
        }

        // STAGE 4: Final desperation matched on parts
        if (combinedMap.size === 0 && searchKw.length > 3) {
            const part = searchKw.slice(0, 4).toLowerCase();
            const broadMatches = [...flatEn, ...flatRu].filter(c => c.searchBase.includes(part));
            broadMatches.slice(0, 50).forEach(m => combinedMap.set(m.label, m));
        }

        let combined = Array.from(combinedMap.values());

        if (combined.length === 0) {
          const stats = `(Searched ${flatEn.length} categories)`;
          sSpinner.stop(pc.red(`❌ No categories found for "${searchKw}" ${stats}.`));
          const tryAgain = await select({ message: "Search failed. Would you like to try a different keyword?", options: [{value: 'YES', label: 'Yes, try again'}, {value: 'NO', label: 'No, exit'}]});
          if (tryAgain !== 'YES') process.exit(1);
          // Loop will naturally continue
        } else {
          sSpinner.stop(`✅ Found ${combined.length} category matches.`);
        }

        category = await select({ 
            message: 'Select the exact Ozon Category:', 
            options: combined.slice(0, 50).map(m => ({ value: m, label: m.label })) 
        });
        if (isCancel(category)) process.exit(0);
        break; // Exit loop on successful selection
    }
  }

  if (category === 'CUSTOM') {
    const catIdStr = await text({ message: 'Enter description_category_id (e.g., 17034177):' });
    const typeIdStr = await text({ message: 'Enter type_id (e.g., 94682):' });
    const labelStr = await text({ message: 'Enter type_label (e.g., Face Cream):' });
    if (isCancel(catIdStr) || isCancel(typeIdStr) || isCancel(labelStr)) process.exit(0);
    category = { catId: parseInt(catIdStr, 10), typeId: parseInt(typeIdStr, 10), label: labelStr };
  }

  // --- Scrape Progress Check (Local File + Database-Backed) ---
  const PROGRESS_FILE = path.join(process.cwd(), "scrape-progress.json");


  // Helpers for local file fallback
  const loadLocalProgress = () => {
    try {
      if (existsSync(PROGRESS_FILE)) {
        return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
      }
    } catch (_) {}
    return {};
  };
  const saveLocalProgress = (key, lastPage) => {
    try {
      const data = loadLocalProgress();
      data[key] = { last_page: lastPage, updated_at: new Date().toISOString() };
      Bun.write(PROGRESS_FILE, JSON.stringify(data, null, 2));
    } catch (_) {}
  };
  const progressKey = `${(brand ? `${brand} ${baseKeyword}` : baseKeyword).toLowerCase().trim()}|${category.catId}|${category.typeId}`;

  const s = spinner();
  s.start('Checking existing scrape progress...');
  let startPage = 1;
  let resumeFrom = null;

  // 1. Try Supabase first
  let supabaseProgressOk = false;
  if (DB_ENABLED) {
    try {
      const { data: exactMatch } = await supabase
        .from('scrape_progress')
        .select('last_page')
        .eq('keyword', keyword)
        .eq('category_id', category.catId)
        .eq('type_id', category.typeId)
        .maybeSingle();

      if (exactMatch) {
        resumeFrom = { page: exactMatch.last_page, reason: `Match found for exact keyword "${keyword}"` };
        supabaseProgressOk = true;
      } else {
        const { data: catMatch } = await supabase
          .from('scrape_progress')
          .select('last_page, keyword')
          .eq('category_id', category.catId)
          .eq('type_id', category.typeId)
          .order('last_page', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (catMatch) {
          resumeFrom = { page: catMatch.last_page, reason: `No exact keyword match, but you reached page ${catMatch.last_page} with "${catMatch.keyword}" in this category` };
          supabaseProgressOk = true;
        }
      }
    } catch (err) {
      console.warn(pc.yellow(`  ⚠️  Supabase progress check failed: ${err.message}`));
    }
  }

  // 2. Fallback: Local JSON file
  if (!supabaseProgressOk) {
    const localData = loadLocalProgress();
    if (localData[progressKey]) {
      const lp = localData[progressKey].last_page;
      resumeFrom = { page: lp, reason: `[Local file] Previously scraped up to page ${lp}` };
      console.log(pc.dim(`  📂 Progress loaded from local file (Supabase unavailable).`));
    }
  }

  s.stop();

  let skipScrapingFlag = false;
  if (resumeFrom) {
    const action = await select({
      message: `${resumeFrom.reason}. How to proceed?`,
      options: [
        { value: 'continue', label: `⏭️ Resume from page ${resumeFrom.page + 1}` },
        { value: 'restart', label: '🔄 Start fresh from page 1' },
        { value: 'skip', label: '⏩ Skip scraping completely and push existing items' }
      ]
    });
    if (isCancel(action)) process.exit(0);
    if (action === 'continue') startPage = resumeFrom.page + 1;
    if (action === 'skip') skipScrapingFlag = true;
  } else {
    // No progress record found anywhere — ask the user to set start page manually
    const manualPageStr = await text({
      message: 'No previous progress found. Which page should scraping start from? (Type 0 to skip scraping)',
      initialValue: '1',
      placeholder: 'Enter page number (e.g. 4 if you already scraped 1-3)',
    });
    if (isCancel(manualPageStr)) process.exit(0);
    const manualPage = parseInt(manualPageStr) || 0;
    if (manualPage === 0) {
      skipScrapingFlag = true;
    } else {
      startPage = manualPage;
      if (manualPage > 1) {
        console.log(pc.cyan(`  ▶️  Starting from page ${manualPage} (as entered).`));
      }
    }
  }

  const oldPriceMultiplierStr = await text({ message: 'Old Price Multiplier (e.g. 2.0 for 50% discount label)', initialValue: '2.0' });
  if (isCancel(oldPriceMultiplierStr)) process.exit(0);
  const oldPriceMultiplier = parseFloat(oldPriceMultiplierStr);

  let maxPages = 0;
  if (!skipScrapingFlag) {
    const maxPagesStr = await text({ message: 'How many pages to scrape in this batch? (Type 0 to SKIP scraping and push existing)', initialValue: '3' });
    if (isCancel(maxPagesStr)) process.exit(0);
    maxPages = parseInt(maxPagesStr) || 0;
  }

  // 2. Scrape Phase
  const pageRangeLog = skipScrapingFlag ? 'Skipped' : (brand ? 'ALL (Dynamic)' : `${startPage} to ${startPage + maxPages - 1}`);
  console.log(pc.cyan(`\n🚀 Starting Scrape Run: Keyword "${baseKeyword}" | Brand: "${brand || 'All'}" | Pages: ${pageRangeLog}`));
  
  s.start(`Scraping Amazon.in...`);
  let scrapedProducts = [];
  try {
    if (maxPages === 0) {
      s.stop(`⏩ Scraping skipped. Loading previous items from local cache...`);
      try {
        scrapedProducts = JSON.parse(readFileSync("m1-m3-output.json", "utf-8"));
      } catch (e) {
        console.warn(pc.yellow("  ⚠️ Could not load m1-m3-output.json. Starting with empty fallback."));
      }
    } else {
        const endPage = startPage + maxPages - 1;
        // Ensure the term used for scraping is consistent
        const scrapeKeyword = (brand ? `${brand} ${baseKeyword}` : baseKeyword).toLowerCase().trim();
        scrapedProducts = await runScraper(scrapeKeyword, brand, 3.5, 2, 500, maxPages, startPage);
        s.stop(`✅ Scraped ${scrapedProducts.length} unique items.`);
        
        // Logging Run Details
        try {
          const logKeyword = (brand ? `${brand} ${baseKeyword}` : baseKeyword).toLowerCase().trim();
          const logEntry = `[${new Date().toISOString()}] Keyword: "${logKeyword}" | Pages: ${startPage}-${endPage} | Scraped: ${scrapedProducts.length}\n`;
          appendFileSync("scrape_logs.txt", logEntry);
        } catch (e) {
          console.warn("  ⚠️ Could not write to scrape_logs.txt");
        }
    }
  } catch (err) {
    s.stop(pc.red('❌ Scraping failed'), 1);
    console.error(err);
    process.exit(1);
  }
  if (!scrapedProducts || scrapedProducts.length === 0) { 
    outro(pc.yellow('No products found matching the criteria.')); 
    process.exit(0); 
  }

  // --- Update Progress (Supabase + Local File fallback) ---
  s.start('Updating scrape progress...');
  try {
    const nextLastPage = startPage + maxPages - 1;
    const progressKeyword = (brand ? `${brand} ${baseKeyword}` : baseKeyword).toLowerCase().trim();

    // Always save to local file first (works even when Supabase is down)
    saveLocalProgress(progressKey, nextLastPage);
    
    if (DB_ENABLED) {
        const { error } = await supabase
          .from('scrape_progress')
          .upsert({
            keyword: progressKeyword,
            category_id: category.catId,
            type_id: category.typeId,
            last_page: nextLastPage,
            updated_at: new Date().toISOString()
          }, { onConflict: 'keyword,category_id,type_id' });
        
        if (error) {
          s.stop(pc.yellow(`⚠️  Failed to update Supabase progress: ${error.message}`));
        } else {
          s.stop(`✅ Progress updated: last_page = ${nextLastPage}`);
        }
    } else {
        s.stop(`✅ Progress saved locally: last_page = ${nextLastPage}`);
    }
  } catch (err) {
    s.stop(pc.yellow(`⚠️  Failed to update progress: ${err.message}`));
  }

  // 3. DB & Sync Phase
  s.start('Saving to pipeline database & syncing countries...');
  let dbResult = { enriched: 0, blockedWeight: 0, enrichedProductsData: [] };
  
  if (DB_ENABLED) {
      try {
        dbResult = await insertProductsToDb(scrapedProducts);
        try {
          await syncCountries(category.catId, category.typeId);
        } catch (syncErr) {
          console.warn(pc.yellow(`  ⚠️ Country sync failed: ${syncErr.message}`));
        }
        s.stop(`✅ DB phase completed. Enriched: ${dbResult.enriched}, Blocked weight: ${dbResult.blockedWeight}`);
      } catch (err) { 
        s.stop(pc.yellow(`⚠️ DB phase had errors: ${err.message}`));
        console.log(pc.cyan("  🚀 Proceeding with direct Ozon push using in-memory data..."));
        
        const products = scrapedProducts.filter(p => p.price_inr > 0).map(cleanProduct);
        dbResult.enrichedProductsData = products.filter(p => p.scrape_status === "enriched");
        dbResult.enriched = dbResult.enrichedProductsData.length;
        dbResult.blockedWeight = products.length - dbResult.enriched;
      }
  } else {
      // Direct processing without calling insertProductsToDb (to avoid internal Supabase logs)
      const products = scrapedProducts.filter(p => p.price_inr > 0).map(p => {
          // Check weight locally
          const status = (p.weight_grams !== null && p.weight_grams <= 500) ? "enriched" : "blocked_weight";
          return { ...p, scrape_status: status };
      });
      dbResult.enrichedProductsData = products.filter(p => p.scrape_status === "enriched");
      dbResult.enriched = dbResult.enrichedProductsData.length;
      dbResult.blockedWeight = products.length - dbResult.enriched;
      s.stop(`✅ Direct Mode: Processed ${products.length} items (Enriched: ${dbResult.enriched})`);
  }
  if (dbResult.enriched === 0) { outro('No pushable products (all blocked by weight or price).'); process.exit(0); }

  // 4. Preview Phase
  s.start('Preparing translations & preview...');
  let enrichedProducts = [];
  
  if (DB_ENABLED) {
      try {
        const { data: dbProducts, error } = await supabase.from('products').select('*').eq('scrape_status', 'enriched').in('asin', scrapedProducts.map((p) => p.asin));
        
        if (error) throw new Error(error.message);
        if (!dbProducts || dbProducts.length === 0) throw new Error("No products found in DB");
        
        enrichedProducts = dbProducts;
      } catch (e) {
        console.warn(pc.yellow(`\n  ⚠️ Supabase read failed (${e.message}). Falling back to in-memory data...`));
        enrichedProducts = dbResult?.enrichedProductsData || [];
      }
  } else {
      enrichedProducts = dbResult.enrichedProductsData;
  }

  // Final check to ensure we have data
  if (enrichedProducts.length === 0 && scrapedProducts.length > 0) {
      const products = scrapedProducts.filter(p => p.price_inr > 0).map(p => {
          const status = (p.weight_grams !== null && p.weight_grams <= 500) ? "enriched" : "blocked_weight";
          return { ...p, scrape_status: status };
      });
      enrichedProducts = products.filter(p => p.scrape_status === "enriched");
  }

  if (!enrichedProducts || enrichedProducts.length === 0) { s.stop('Items not found in DB or memory.'); process.exit(0); }

  const inrUsdRate = await fetchInrUsdRate();
  const previewItems = enrichedProducts.slice(0, 3);
  const table = new Table({ head: [pc.cyan('ASIN'), pc.cyan('Title (RU)'), pc.cyan('₹ INR'), pc.cyan('$ USD')], colWidths: [13, 50, 9, 9] });

  for (const p of previewItems) {
    const { title_ru } = await translateProduct(p);
    const usd = computeUsdPrice(p.price_inr, inrUsdRate).toFixed(2);
    table.push([p.asin, title_ru.slice(0, 46) + '...', p.price_inr, usd]);
  }
  s.stop('✅ Preview:');
  console.log(table.toString());

  // 5. Push Phase
  const CHECKPOINT_FILE = path.join(process.cwd(), "upload-checkpoint.json");
  let startIndex = 0;
  
  if (existsSync(CHECKPOINT_FILE)) {
      try {
          const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, "utf-8"));
          if (cp.last_index >= 0 && cp.last_index < enrichedProducts.length) {
              const doResume = await confirm({ message: `Found upload checkpoint at index ${cp.last_index} (ASIN: ${cp.last_asin}). Resume from here?` });
              if (doResume) startIndex = cp.last_index + 1;
          }
      } catch (e) {}
  }

  const shouldPush = await confirm({ message: `Push ${enrichedProducts.length - startIndex} items to Ozon?` });
  if (!shouldPush) { outro('Canceled.'); process.exit(0); }

  const concurrencyLimit = 5; // RECOVERY: Increased concurrency from 1 to 5 for faster pushing
  const BATCH_SIZE = 20;      // BATCHING: Process 20 products at a time
  s.start('Pushing to Ozon...');
  let successCount = 0; let failCount = 0;

  async function doPush(p, i) {
    try {
      const res = await pushProductToOzon(p, inrUsdRate, {
        descriptionCategoryId: category.catId, typeId: category.typeId, typeLabel: category.label,
        oldPriceMultiplier, weightGateGrams: 500
      });
      if (res.success) {
        successCount++;
        // Write Checkpoint after SUCCESS
        try {
            writeFileSync(CHECKPOINT_FILE, JSON.stringify({
                last_index: i,
                last_asin: p.asin,
                task_id: res.taskId || "no_task_id",
                timestamp: new Date().toISOString()
            }));
        } catch(e) { }
      } else {
        failCount++;
        console.error(pc.red(`  ❌ [${i + 1}/${enrichedProducts.length}] ${p.asin} - Error: ${res.error || "Unknown"}`));
      }
    } catch (err) { 
      failCount++; 
      console.error(pc.red(`  ❌ [${i + 1}/${enrichedProducts.length}] ${p.asin} - Fatal: ${err.message}`));
    }
  }

  for (let batchStart = startIndex; batchStart < enrichedProducts.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, enrichedProducts.length);
    const chunk = enrichedProducts.slice(batchStart, batchEnd);
    
    for (let i = 0; i < chunk.length; i += concurrencyLimit) {
      const microChunk = chunk.slice(i, i + concurrencyLimit);
      await Promise.all(microChunk.map((p, idx) => doPush(p, batchStart + i + idx)));
      process.stdout.write(`\r  Progress: ${batchStart + i + microChunk.length}/${enrichedProducts.length} pushed...`);
    }
    
    // FREE MEMORY AFTER BATCH
    if (typeof Bun !== "undefined" && Bun.gc) {
       Bun.gc(true); // Force garbage collection 
    }
  }
  process.stdout.write("\n");

  outro(pc.green(`✨ Done! Success: ${successCount}, Failed: ${failCount}`));
}

if (import.meta.main) { main().catch(err => { console.error('Fatal error:', err); process.exit(1); }); }
