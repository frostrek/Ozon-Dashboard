#!/usr/bin/env bun

/**
 * M1 + M3 — Amazon.in scraper (Updated: Database-Backed)
 */

import { readFileSync, existsSync } from "fs";

// ─── Safe-word sanitizer (mirrors m9-ozon-push.js) ───────────────────────────
// Products containing Ashwagandha / Withania somnifera are NOT skipped.
// Instead all restricted words are replaced with neutral compliant alternatives
// before the product data enters the DB / push pipeline.

const BANNED_REPLACEMENTS = [
  { regex: /ashwagandha/gi,          safe: "herbal supplement" },
  { regex: /ashvagandha/gi,          safe: "wellness formula" },
  { regex: /withania\s+somnifera/gi, safe: "herbal blend" },
  { regex: /withania/gi,             safe: "plant extract" },
  { regex: /somnifera/gi,            safe: "plant-based formula" },
  { regex: /ашвагандха/gi,           safe: "растительный экстракт" },
  { regex: /ашваганда/gi,            safe: "аюрведический сбор" },
  { regex: /витания/gi,              safe: "травяной сбор" },
  { regex: /сомнифера/gi,            safe: "растительная добавка" },
];

function sanitizeValue(val) {
  if (typeof val !== "string") return val;
  let t = val;
  for (const { regex, safe } of BANNED_REPLACEMENTS) t = t.replace(regex, safe);
  return t;
}

// Fields that must NEVER be sanitized — they are identity/lookup keys used
// verbatim for Ozon brand matching and DB deduplication.
const PROTECTED_KEYS = new Set([
  "brand", "asin", "amazon_url", "manufacturer", "scraped_keyword",
  "country_of_origin", "scraped_at", "availability"
]);

function deepSanitizeProduct(obj, parentKey = null) {
  // Never touch identity / lookup fields
  if (parentKey !== null && PROTECTED_KEYS.has(parentKey)) return obj;

  if (typeof obj === "string") return sanitizeValue(obj);
  if (Array.isArray(obj))      return obj.map(item => deepSanitizeProduct(item, parentKey));
  if (obj !== null && typeof obj === "object") {
    const out = {};
    for (const key in obj) {
      out[key] = PROTECTED_KEYS.has(key) ? obj[key] : deepSanitizeProduct(obj[key], key);
    }
    return out;
  }
  return obj;
}

// ─── Config (Driven by TUI usually) ──────────────────────────────────────────

let conf = {};
try {
  conf = JSON.parse(readFileSync("./l98.conf.json", "utf8"));
} catch (e) {}

const KEYWORD = conf?.scraper?.keyword || "sunscreen";
const MIN_RATING = conf?.scraper?.min_rating || 2.1;
const CONCURRENCY = 2; 
const DELAY_MS = conf?.scraper?.delay_ms || 500;
const MAX_VARIANTS = conf?.scraper?.max_variants_per_product ?? conf?.scraper?.max_variants ?? 5;

// Categories that trigger cosmetic variant scraping
const VARIANT_TARGET_CATEGORIES = [
  "makeup", "lipstick", "foundation", "concealer", "compact", "nail polish", "serum"
];

function isVariantCategory(category, keyword) {
  const cat = (category || "").toLowerCase();
  const kw = (keyword || "").toLowerCase();
  return VARIANT_TARGET_CATEGORIES.some(t => cat.includes(t) || kw.includes(t));
}


// ─── Anti-Detection Globals ──────────────────────────────────────────────────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0"
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const randomSleep = (baseMs) => new Promise(r => setTimeout(r, baseMs + Math.floor(Math.random() * 3000)));

let currentSessionId = Math.floor(Math.random() * 999999);


// ─── URL builders ─────────────────────────────────────────────────────────────

let keyCursor = 0;
const deadKeys = new Set();

function scraperKeys() {
  const raw = [Bun.env.SCRAPER_API_KEYS, Bun.env.SCRAPER_API_KEY].filter(Boolean).join(",");
  return [...new Set(raw.split(/[\s,;]+/).map((key) => key.trim()).filter(Boolean))];
}

function activeKey() {
  const keys = scraperKeys();
  while (keyCursor < keys.length && deadKeys.has(keys[keyCursor])) keyCursor += 1;
  return keyCursor < keys.length ? keys[keyCursor] : "";
}

function retireKey(key) {
  if (key) deadKeys.add(key);
  const keys = scraperKeys();
  const next = keys.findIndex((item, index) => index > keys.indexOf(key) && !deadKeys.has(item));
  keyCursor = next === -1 ? keys.length : next;
}

function withActiveKey(url) {
  const key = activeKey();
  if (!key) {
    const exhausted = new Error("The ScraperAPI account has no credits left. Amazon pages cannot be fetched until the plan resets or another key is added.");
    exhausted.code = "SCRAPER_API_CREDITS_EXHAUSTED";
    throw exhausted;
  }
  const target = new URL(url);
  target.searchParams.set("api_key", key);
  return target;
}

function buildSearchUrl(keyword, page = 1) {
  const amazonUrl = new URL("https://www.amazon.in/s");
  amazonUrl.searchParams.set("k", keyword);
  amazonUrl.searchParams.set("i", "aps");
  amazonUrl.searchParams.set("primeEligible", "1");
  amazonUrl.searchParams.set("page", page);

  const scraperUrl = new URL("https://api.scraperapi.com/");
  scraperUrl.searchParams.set("api_key", Bun.env.SCRAPER_API_KEY);
  scraperUrl.searchParams.set("url", amazonUrl.toString());
  scraperUrl.searchParams.set("country_code", "in");
  scraperUrl.searchParams.set("autoparse", "true");
  // Hardening
  scraperUrl.searchParams.set("keep_headers", "true");
  scraperUrl.searchParams.set("session_number", currentSessionId);
  return scraperUrl.toString();
}

function buildDetailUrl(asin) {
  const scraperUrl = new URL("https://api.scraperapi.com/");
  scraperUrl.searchParams.set("api_key", Bun.env.SCRAPER_API_KEY);
  scraperUrl.searchParams.set("url", `https://www.amazon.in/dp/${asin}`);
  scraperUrl.searchParams.set("country_code", "in");
  scraperUrl.searchParams.set("autoparse", "true");
  // Hardening
  scraperUrl.searchParams.set("keep_headers", "true");
  scraperUrl.searchParams.set("session_number", currentSessionId);
  return scraperUrl.toString();
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchJson(url, label, retries = 5) {
  let useRenderJs = false;
  const attempts = Math.max(retries, scraperKeys().length + 1);
  
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const targetUrl = withActiveKey(url);
      if (useRenderJs) {
        targetUrl.searchParams.set("render", "true");
        console.log(`  🌐 [${label}] Enabling JavaScript Rendering for attempt ${attempt}...`);
      }

      const res = await fetch(targetUrl.toString(), { 
        headers: { 
          "User-Agent": getRandomUA(),
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        },
        signal: AbortSignal.timeout(90_000) // Longer timeout for JS rendering
      });

      if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) {
           const text = await res.text();
           console.log(`  [Diagnostics] Received HTML snippet: ${text.slice(0, 150)}...`);
           
           if (text.includes("captcha") || text.includes("robot") || text.includes("api-services-support@amazon.com")) {
              useRenderJs = true; // Fallback to JS rendering on next attempt
              throw new Error(`Amazon CAPTCHA/Blockage detected in HTML`);
           }
           throw new Error(`Got HTML instead of JSON (${ct})`);
        }
        const json = await res.json();
        if (!json || typeof json !== 'object') {
          throw new Error(`Received invalid JSON from Scraper API for ${label}`);
        }
        
        const allText = JSON.stringify(json).toLowerCase();
        if (allText.includes("hydroquinone")) {
          if (json.results && Array.isArray(json.results)) {
            const before = json.results.length;
            json.results = json.results.filter(item => item && !JSON.stringify(item).toLowerCase().includes("hydroquinone"));
            const removed = before - json.results.length;
            if (removed > 0) console.warn(`  🚫 Filtered ${removed} items from ${label} due to hydroquinone.`);
            return json;
          }
          console.warn(`  🚫 Skipping ${label}: Contains hydroquinone (restricted category)`);
          return null;
        }
        return json;
      }

      // Handle blockages (403/429) specially
      if ((res.status === 403 || res.status === 429) && attempt < attempts) {
        const text = await res.text().catch(() => "");
        if (text.includes("exhausted the API Credits")) {
          const used = targetUrl.searchParams.get("api_key");
          retireKey(used);
          const next = activeKey();
          if (next) {
            console.warn(`  ScraperAPI key has no credits. Switching to the next key.`);
            continue;
          }
          console.error(`\x1b[31m  ❌ SCRAPER API CREDITS EXHAUSTED. Please upgrade or wait for reset.\x1b[0m`);
          const exhausted = new Error("The ScraperAPI account has no credits left. Amazon pages cannot be fetched until the plan resets or another key is added.");
          exhausted.code = "SCRAPER_API_CREDITS_EXHAUSTED";
          throw exhausted;
        }
        console.log(`  [Diagnostics] HTTP ${res.status} Body: ${text.slice(0, 100)}...`);
        
        // If 403, definitely try JS rendering next
        if (res.status === 403) useRenderJs = true;

        const waitSec = attempt * 10 + Math.floor(Math.random() * 10);
        console.log(`  ⏳ [${label}] HTTP ${res.status}. Cooling down ${waitSec}s (Attempt ${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }

      if (res.status >= 500 && attempt < attempts) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      
      throw new Error(`HTTP ${res.status} for ${label}`);
    } catch (e) {
      if (e.code === "SCRAPER_API_CREDITS_EXHAUSTED" || String(e.message || "").includes("no credits left")) throw e;
      if (attempt >= attempts) throw e;
      const wait = attempt * 5000;
      console.warn(`  ⚠️  [${label}] Attempt ${attempt} failed: ${e.message}. Retrying...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseWeightGrams(productInfo) {
  const raw = productInfo?.["Item Weight"] ?? productInfo?.["Net Weight"] ?? null;
  if (!raw) return null;
  const str = String(raw).trim();
  const kgMatch = str.match(/([\d.]+)\s*kg/i);
  const gMatch = str.match(/([\d.]+)\s*g/i);
  if (kgMatch) return Math.round(parseFloat(kgMatch[1]) * 1000);
  if (gMatch) return Math.round(parseFloat(gMatch[1]));
  return null;
}

function parseVolume(raw, name = "", bullets = [], description = "") {
  const sources = [String(raw || ""), name, ...bullets, description].filter(Boolean).join(" ");
  if (!sources) return null;
  
  const str = sources.toLowerCase();
  
  // High-precision volume/weight regex
  // 1. Volumes (ml/l)
  const mlMatch = str.match(/(\d[\d.]*)\s*(ml|milliliter|millilitre|мл|миллилитр)/i);
  if (mlMatch) return Math.round(parseFloat(mlMatch[1]));
  
  const lMatch = str.match(/(\d[\d.]*)\s*(l|litre|liter|л|литр)/i);
  if (lMatch) return Math.round(parseFloat(lMatch[1]) * 1000);
  
  // 2. Weights (g/kg)
  const gMatch = str.match(/(\d[\d.]*)\s*(gram|gm|g|гр|грамм)/i);
  if (gMatch) return Math.round(parseFloat(gMatch[1]));
  
  const kgMatch = str.match(/(\d[\d.]*)\s*(kg|кг|килограмм)/i);
  if (kgMatch) return Math.round(parseFloat(kgMatch[1]) * 1000);
  
  // 3. US Units (oz/fl oz)
  const ozMatch = str.match(/(\d[\d.]*)\s*(fl oz|fluid ounce|oz|унция)/i);
  if (ozMatch) return Math.round(parseFloat(ozMatch[1]) * 29.57);

  // 4. Case-insensitive variations
  const mlMatchGeneric = str.match(/(\d[\d.]*)\s*(ml|мл|миллилитр|milliliter)/i);
  if (mlMatchGeneric) return Math.round(parseFloat(mlMatchGeneric[1]));

  return null;
}



/**
 * Removes diacritics (accents) and lowercases text for robust matching
 */
function normalizeText(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ") // Replace special chars with space to help word matching
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Semantic product type matcher (v22 Hardening)
 * Ensures "Face Cream" doesn't match "Face Wash"
 */
function matchesType(title, filter) {
  if (!filter || filter.toLowerCase() === "all") return true;
  
  const t = normalizeText(title);
  const f = normalizeText(filter);
  
  // Basic substring check
  if (t.includes(f)) return true;

  // 1. Semantic Logic for Supplements (Relaxed Category)
  // Broad detection: fuzzy stems catch misspellings like 'suppliment' or 'vitamins'
  const supplementTriggers = ["suppl", "vitam", "miner", "biot", "multivit", "omega", "herbal", "ashwagandha", "protein", "collagen", "probiotic", "zinc", "iron", "calcium", "magnesium"];
  const isSupplementSearch = supplementTriggers.some(trigger => f.includes(trigger));

  if (isSupplementSearch) {
    // For supplements, we are HYPER-RELAXED to avoid "food" blocking "supplement"
    // Allow if title contains generic category keywords
    const genericTerms = ["supplement", "suppliment", "vitamin", "multivitamin", "tablet", "capsule", "softgel", "gummy", "powder", "biotin", "omega", "herbal", "extract", "oil", "protein", "ayurvedic"];
    const hasGenericTerm = genericTerms.some(term => t.includes(term));
    
    // Also allow if ANY meaningful word from the search query is in the title
    const searchWords = f.split(/\s+/).filter(w => w.length > 3); 
    const isVeryBroadQuery = f.includes("suppl") || f.includes("vitam");

    // If it's a very broad category search (like "food supplement"), and the title 
    // is clearly a supplement, we accept it.
    if (isVeryBroadQuery && hasGenericTerm) return true;

    // Specifically accept common supplement names if they appear in title
    const hasMeaningfulWord = searchWords.some(w => t.includes(w));
    
    return hasGenericTerm || hasMeaningfulWord;
  }

  // 2. Semantic Logic for "Cream" (Legacy preserved)
  if (f.includes("cream")) {
    const isCream = t.includes("cream") || t.includes("moisturizer") || t.includes("moisturiser");
    const isMismatch = t.includes("wash") || t.includes("scrub") || t.includes("serum") || t.includes("cleanser") || t.includes("sunscreen");
    return isCream && !isMismatch;
  }
  
  // 3. Grocery / Spices Logic (Relaxed Category)
  const groceryTriggers = ["spice", "masala", "dal", "pulses", "tea", "coffee", "tata", "sampann", "vedaka", "aashirvaad"];
  const isGrocerySearch = groceryTriggers.some(trigger => f.includes(trigger));
  if (isGrocerySearch) {
    if (f.includes("tata sampann") && t.includes("tata sampann")) {
      const otherWords = f.replace("tata sampann", "").split(/\s+/).filter(w => w.length > 2);
      if (otherWords.length > 0) return otherWords.some(w => t.includes(w));
      return true;
    }
    if (f.includes("vedaka") && t.includes("vedaka")) {
      const otherWords = f.replace("vedaka", "").split(/\s+/).filter(w => w.length > 2);
      if (otherWords.length > 0) return otherWords.some(w => t.includes(w));
      return true;
    }
    
    const words = f.split(/\s+/).filter(w => w.length > 2);
    const matches = words.filter(w => t.includes(w));
    if (matches.length >= Math.ceil(words.length / 2)) return true;
  }

  // 4. Default strict logic (Legaxy preserved)
  const words = f.split(/\s+/).filter(w => w.length > 2);
  return words.every(w => t.includes(w));
}

// ─── Data merger ──────────────────────────────────────────────────────────────

function normalizeBrand(str) {
  if (!str) return str;
  let lower = str.toLowerCase();
  
  // Hardcoded known brands
  if (lower.includes("tata sampann")) return "Tata Sampann";
  if (lower.includes("vedaka")) return "Vedaka";
  if (lower.includes("l'oréal") || lower.includes("l’oréal") || lower.includes("loreal") || lower.includes("l`oreal")) {
      if (lower.includes("professionnel")) return "L'Oréal Professionnel";
      return "L'Oreal Paris";
  }

  // Generic cleanup: Remove hidden characters and common address/company tags
  let clean = str.replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim();
  const stripTriggers = ["Pvt. Ltd", "Pvt Ltd", "Private Limited", "Inc.", "LLC", "M. Lic. No", ","];
  
  for (const token of stripTriggers) {
      const idx = clean.toLowerCase().indexOf(token.toLowerCase());
      if (idx !== -1) {
          clean = clean.substring(0, Math.max(0, idx)).trim();
      }
  }

  // If it's dangerously long (likely an address fallback), chop it aggressively
  if (clean.length > 35) {
      clean = clean.split(" ").slice(0, 2).join(" ").trim();
  }

  return clean || str;
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function largerAmazonImage(value) {
  const url = String(value || "").trim();
  const enlarged = url.replace(/\._[A-Z]{2}\d+(?:_[A-Z0-9]+)*_\./i, ".");
  return isHttpUrl(enlarged) ? enlarged : url;
}

function imageCandidate(raw) {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  return raw.hiRes || raw.large || raw.link || raw.url || raw.image || "";
}

export function collectImageUrls(...sources) {
  const seen = new Set();
  const urls = [];
  for (const source of sources) {
    const list = Array.isArray(source) ? source : source ? [source] : [];
    for (const raw of list) {
      const candidate = imageCandidate(raw);
      if (!isHttpUrl(candidate)) continue;
      const url = largerAmazonImage(candidate);
      if (!isHttpUrl(url) || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= 8) return urls;
    }
  }
  return urls;
}

function mergeProduct(searchItem, detail, keyword = null) {
  if (!detail || typeof detail !== "object") {
    console.warn(`  ⚠️  Skipping ${searchItem?.asin || 'Unknown'}: invalid detail data`);
    return null;
  }
  const info = detail?.product_information ?? detail?.specifications ?? {};

  const rawDesc = detail?.description ?? detail?.product_description ?? info?.["Product Description"] ?? null;
  const rawIngredients = detail?.ingredients ?? info?.["Active Ingredients"] ?? info?.["Ingredients"] ?? detail?.important_information?.ingredients ?? null;
  const rawDirections = detail?.directions ?? info?.["Directions"] ?? info?.["How to Use"] ?? detail?.important_information?.directions ?? null;

  return {
    asin: searchItem.asin,
    amazon_url: `https://www.amazon.in/dp/${searchItem.asin}`,
    name: detail.name ?? searchItem.name,
    feature_bullets: detail.feature_bullets ?? [],
    product_category: detail.product_category ?? null,
    price_inr: searchItem.price ?? null,
    original_price_inr: searchItem.original_price?.price ?? null,
    rating: searchItem.stars ?? detail.average_rating ?? null,
    total_reviews: detail.total_reviews ?? searchItem.total_reviews ?? null,
    image_urls: collectImageUrls(
      detail.highResImages,
      detail.hiResImages,
      detail.images,
      detail.image_urls,
      detail.main_image,
      detail.images_list,
      searchItem?.image,
      searchItem?.thumbnail,
      searchItem?.image_url,
    ),
    weight_grams: parseWeightGrams(info),
    dimensions: info["Product Dimensions"] ?? info["Item Dimensions LxWxH"] ?? null,
    net_quantity: info["Net Quantity"] ?? null,
    volume_ml: parseVolume(info["Net Quantity"], detail.name || searchItem.name, detail.feature_bullets, rawDesc),
    ingredients: rawIngredients,
    directions: rawDirections,
    specifications: detail.specifications ?? null,
    raw_product_info: info,
    manufacturer: info["Manufacturer"] ?? null,
    country_of_origin: info["Country of Origin"] ?? null,
    brand: normalizeBrand(detail.brand ?? searchItem.brand ?? info["Brand"] ?? info["Manufacturer"] ?? null),
    availability: detail.availability_status ?? null,
    description: rawDesc,
    scraped_keyword: keyword,
    scraped_at: new Date().toISOString(),
    parent_asin: detail.parent_asin ?? null,
    variant_type: null,
    variant_value: null,
  };
}


function weightBandId(grams) {
  const weight = Number(grams);
  if (!(weight > 0)) return "unknown";
  if (weight <= 100) return "upto100";
  if (weight <= 200) return "upto200";
  if (weight <= 500) return "upto500";
  return "over500";
}

function bandsSelected(bands) {
  return ["upto100", "upto200", "upto500", "over500", "unknown"].some((id) => bands?.[id]);
}

function keepWeight(grams, bands, applyWeightGate, weightLimit) {
  if (bands) {
    if (!bandsSelected(bands)) return true;
    return Boolean(bands[weightBandId(grams)]);
  }
  if (!applyWeightGate) return true;
  if (!(Number(grams) > 0)) return true;
  return Number(grams) <= weightLimit;
}

function passesCustom(product, custom, allowUnknownWeight) {
  if (!custom?.kind || !(Number(custom.amount) > 0)) return true;
  const amount = Number(custom.amount);
  const weight = Number(product?.weight_grams);
  const rating = Number(product?.rating);
  const price = Number(product?.price_inr);
  if (custom.kind === "weight-max" || custom.kind === "weight-min") {
    if (!(weight > 0)) return Boolean(allowUnknownWeight);
    if (custom.kind === "weight-max") return weight <= amount;
    return weight >= amount;
  }
  if (custom.kind === "rating-min") return rating > 0 && rating >= amount;
  if (custom.kind === "price-max") return price > 0 && price <= amount;
  if (custom.kind === "price-min") return price >= amount;
  return true;
}

// ─── Main Logic ───────────────────────────────────────────────────────────────

export async function runScraper(keyword = KEYWORD, brandFilter = null, minRating = MIN_RATING, concurrency = 2, delayMs = 500, maxPages = 3, startPage = 1, options = {}) {
  if (!scraperKeys().length) throw new Error("SCRAPER_API_KEY not set in .env");
  const productLimit = Number(options.maxProducts) > 0 ? Number(options.maxProducts) : 0;
  const knownAsins = new Set(
    (Array.isArray(options.knownAsins) ? options.knownAsins : [])
      .map((asin) => String(asin || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const applyWeightGate = options.applyWeightGate !== false;
  const weightLimit = Number(options.weightGateGrams) > 0 ? Number(options.weightGateGrams) : 500;
  const weightBands = options.weightBands && typeof options.weightBands === "object" ? options.weightBands : null;
  const rules = options.scrapeRules && typeof options.scrapeRules === "object" ? options.scrapeRules : {};
  const inStockOnly = rules.inStockOnly === true;
  const skipSponsored = rules.skipSponsored === true;
  const skipUnrated = rules.skipUnrated === true;
  const makePacks = rules.makePacks === true;
  const includeShades = rules.includeShades === true;
  const custom = rules.custom && typeof rules.custom === "object" ? rules.custom : {};
  const ratingFloor = Math.max(Number(minRating) || 0, custom.kind === "rating-min" ? Number(custom.amount) || 0 : 0);
  
  // Rotate session ID per category run
  currentSessionId = Math.floor(Math.random() * 999999);


  const isStrict = !!brandFilter;
  const cleanBrand = brandFilter ? brandFilter.toLowerCase().trim() : null;

  console.log("=== M1+M3 — Amazon.in Scraper ===");
  console.log(`Keyword    : "${keyword}"`);
  if (brandFilter) console.log(`Brand      : "${brandFilter}" (STRICT FILTER)`);
  console.log(`Pages      : ${startPage} to ${startPage + maxPages - 1} (Limit: ${maxPages})\n`);
  if (productLimit) console.log(`Products   : ${productLimit} new product(s). Already saved products are skipped.\n`);
  console.log(`Min rating : ${minRating}\n`);

  const searchEligible = (item) => {
    if (!item?.asin) return false;
    if (skipSponsored && item._sponsored) return false;
    const parsed = parseFloat(item.stars) || parseFloat(item.rating) || 0;
    if (skipUnrated && !(parsed > 0)) return false;
    const stars = parsed > 0 ? parsed : 5;
    return stars >= ratingFloor;
  };

  // Step 1: Search (Multiple Pages)
  console.log(`[1/3] Fetching pages...`);
  let allSearchItems = [];
  
  const SAFETY_PAGE_LIMIT = 50;
  const plannedLastPage = startPage + maxPages - 1;
  const lastPageAllowed = productLimit ? SAFETY_PAGE_LIMIT : plannedLastPage;
  let page = startPage;
  let consecutiveEmptyPages = 0;
  let skippedKnown = 0;
  const freshAsins = new Set();

  while (page <= lastPageAllowed) {
    // Safety limit
    if (page > SAFETY_PAGE_LIMIT) {
        console.log(`  ⚠️ Safety limit reached (${SAFETY_PAGE_LIMIT} pages). stopping.`);
        break;
    }

    const url = buildSearchUrl(keyword, page);
    process.stdout.write(`  Page ${page}... `);
    
    try {
      const data = await fetchJson(url, `search_p${page}`);
      
      // Include organic results and common sponsored result keys from ScraperAPI
      const results = [
        ...(data?.results ?? []).map((item) => ({ ...item, _sponsored: Boolean(item?.sponsored || item?.is_sponsored || item?.isSponsored) })),
        ...(data?.ads ?? []).map((item) => ({ ...item, _sponsored: true })),
        ...(data?.sponsored_products ?? []).map((item) => ({ ...item, _sponsored: true })),
        ...(data?.paid ?? []).map((item) => ({ ...item, _sponsored: true })),
      ];
      
      if (results.length === 0) {
        process.stdout.write("No more results.\n");
        break;
      }

      // Filter by Brand + Product Type. Already saved ASINs do not count toward the target.
      let matchesOnPage = 0;
      let skippedOnPage = 0;
      for (const item of results) {
          const itemBrand = item.brand || "";
          const isBrandMatch = !cleanBrand || itemBrand.toLowerCase().includes(cleanBrand);
          const isTypeMatch = matchesType(item.name, keyword);

          if (isBrandMatch && isTypeMatch) {
              const asinKey = String(item.asin || "").trim().toUpperCase();
              if (productLimit && asinKey && knownAsins.has(asinKey)) {
                  skippedKnown++;
                  skippedOnPage++;
                  continue;
              }
              allSearchItems.push(item);
              matchesOnPage++;
              if (asinKey && searchEligible(item)) freshAsins.add(asinKey);
          }
      }

      process.stdout.write(`Found ${matchesOnPage} matching items${skippedOnPage ? `, skipped ${skippedOnPage} already saved` : ""}.\n`);
      console.log(`Page ${page} -> ${matchesOnPage} new products${skippedOnPage ? ` (${skippedOnPage} already saved)` : ""}`);
      
      if (matchesOnPage === 0 && skippedOnPage === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 3) {
            console.log(`  🛑 Stopping early: 3 consecutive pages with 0 matches.`);
            break;
        }
      } else {
        consecutiveEmptyPages = 0;
      }

      if (productLimit && freshAsins.size >= productLimit) {
        console.log(`  Target of ${productLimit} new product(s) found. Stopping search.`);
        break;
      }
      if (productLimit && page >= plannedLastPage && freshAsins.size < productLimit) {
        console.log(`  ${freshAsins.size}/${productLimit} new products after the requested pages. Checking the next page.`);
      }
      
      // Jitter delay between pages (v39 Hardening)
      const pageDelay = 2000 + Math.floor(Math.random() * 5000);
      await new Promise(r => setTimeout(r, pageDelay));
      page++;
    } catch (err) {
      if (err.code === "SCRAPER_API_CREDITS_EXHAUSTED" || String(err.message || "").includes("no credits left")) throw err;
      console.error(`\n  ⚠️  Failed to fetch search page ${page}: ${err.message}`);
      break;
    }
  }

  const eligible = allSearchItems.filter(r => {
      if (!r.asin) return false;
      if (skipSponsored && r._sponsored) return false;
      const parsed = parseFloat(r.stars) || parseFloat(r.rating) || 0;
      if (skipUnrated && !(parsed > 0)) return false;
      const stars = parsed > 0 ? parsed : 5;
      return stars >= ratingFloor;
  });
  const uniqueAsins = new Map();
  eligible.forEach(item => { if (!uniqueAsins.has(item.asin)) uniqueAsins.set(item.asin, item); });
  const uniqueEligible = Array.from(uniqueAsins.values());

  console.log(`  Unique eligible items        : ${uniqueEligible.length}`);
  if (skippedKnown) console.log(`  Already in the catalog, skipped : ${skippedKnown}`);
  if (productLimit && uniqueEligible.length < productLimit) {
    console.log(`  Search ended with ${uniqueEligible.length}/${productLimit} new products.`);
  }
  console.log(`  Total Scraped -> ${uniqueEligible.length} products\n`);

  if (uniqueEligible.length === 0) return [];

  // Step 3: Detail Discovery & Fetching
  // Keep every new match. The loop stops once the target number of accepted products is reached,
  // so a weight or stock skip can be replaced by the next product.
  const detailQueue = uniqueEligible;
  console.log(`[2/3] Fetching detail pages (concurrency: ${concurrency})...`);
  const products = [];
  const acceptProduct = (product) => {
    const asin = String(product?.asin || "").trim().toUpperCase();
    if (productLimit && asin && knownAsins.has(asin)) {
      console.warn(`  ⏭️  SKIP ${asin}: already in the catalog`);
      return false;
    }
    products.push(product);
    return true;
  };
  const masterSet = new Set(detailQueue.map(i => i.asin));
  let queue = [...detailQueue];
  let fetched = 0, failed = 0;

  // We process the queue which may grow if variants are found
  for (let i = 0; i < queue.length; i += concurrency) {
    if (productLimit && products.length >= productLimit) break;
    const batch = queue.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(item => fetchJson(buildDetailUrl(item.asin), item.asin)));

    for (let j = 0; j < batch.length; j++) {
      const currentItem = batch[j];
      const res = results[j];

      if (res.status === "rejected" && (res.reason?.code === "SCRAPER_API_CREDITS_EXHAUSTED" || String(res.reason?.message || "").includes("no credits left"))) {
        throw res.reason;
      }

      if (res.status === "fulfilled" && res.value) {
        const detail = res.value;
        try {
          const merged = mergeProduct(currentItem, detail, keyword);
          if (merged && merged.price_inr > 0) {
            
            if (!keepWeight(merged.weight_grams, weightBands, applyWeightGate, weightLimit)) {
                console.warn(`  ⚖️  SKIP ${currentItem.asin}: weight ${merged.weight_grams || "unknown"} is outside the selected bands`);
                failed++;
                continue;
            }
            if (inStockOnly && /out of stock|unavailable/i.test(String(merged.availability || ""))) {
                console.warn(`  ⛔ SKIP ${currentItem.asin}: out of stock`);
                failed++;
                continue;
            }
            if (!passesCustom(merged, custom, Boolean(weightBands?.unknown))) {
                console.warn(`  ⏭️  SKIP ${currentItem.asin}: outside the custom condition`);
                failed++;
                continue;
            }

            // ─── Cosmetic Variant Logic ─────────────────────────────────────────
            const isCosmetic = isVariantCategory(merged.product_category, keyword);
            
            // PRIMARY: Read from customization_options.Colour (Amazon.in's actual shade field)
            // FALLBACK: Read from variations / variation_options / variants
            const customOpts = detail.customization_options || {};
            const colourOpts = customOpts["Colour"] || customOpts["Color"] || customOpts["Shade"] || [];
            const shadeVariants = colourOpts.filter(v => v.asin && v.value);

            const rawVariations = shadeVariants.length > 0
              ? shadeVariants
              : (detail.variations || detail.variation_options || detail.variants || []);

            if (includeShades && isCosmetic && rawVariations.length > 0) {
              // Identify the parent ASIN (the one currently selected on this page)
              const selectedShade = shadeVariants.find(v => v.is_selected) || shadeVariants[0];
              const parentAsin = detail.parent_asin || selectedShade?.asin || merged.asin;
              merged.parent_asin = parentAsin;

              console.log(`  💄 ${merged.name?.slice(0,50)} — Found ${rawVariations.length} shade variants. Parent: ${parentAsin}`);

              let variantsAdded = 0;
              for (const v of rawVariations) {
                if (variantsAdded >= MAX_VARIANTS) break;
                if (!v.asin) continue;
                if (inStockOnly && v.is_available === false) continue;

                // Extract shade name and code
                const vValue = (v.value || v.color || v.name || '').trim();
                if (!vValue) continue;

                // Each shade entry has its own swatch image; use it as the primary variant image.
                // The full PDP images will be fetched if needed, but the swatch IS the unique identifier.
                const variantImages = collectImageUrls(v.image, merged.image_urls.slice(0, 4));

                const variantProduct = {
                  ...merged,
                  asin:          v.asin,
                  amazon_url:    `https://www.amazon.in/dp/${v.asin}`,
                  name:          `${merged.name} - ${vValue}`,
                  price_inr:     v.price || merged.price_inr,
                  image_urls:    variantImages,
                  availability:  v.is_available === false ? "Out of Stock" : "In Stock",
                  parent_asin:   parentAsin,
                  variant_type:  "Color/Shade",
                  variant_value: vValue,
                };

                const sanitizedVariant = deepSanitizeProduct(variantProduct);
                if (!acceptProduct(sanitizedVariant)) continue;
                console.log(`    ↳ Shade: ${v.asin} | "${vValue}" | Images: ${variantImages.length} (Swatch: ${v.image ? v.image.slice(-30) : 'n/a'})`);
                variantsAdded++;
              }
            } else if (isCosmetic || !makePacks) {
                if (isCosmetic) console.log(`  ⚠️  ${merged.name?.slice(0,50)} — Uploading one listing`);
                else console.log(`  📦 ${merged.asin}: quantity packs are off, keeping one unit`);
                acceptProduct(deepSanitizeProduct(merged));
            } else {
                // Non-cosmetic -> Generate quantity packs!
                const w = merged.weight_grams;
                let maxPacks = 1;
                
                if (!w || w <= 0) {
                    console.log(`  ⚖️  WEIGHT_NOT_CONFIRMED for ${merged.asin}. Falling back to Pack of 1 only.`);
                    maxPacks = 1;
                } else if (w <= 100) {
                    maxPacks = 4;
                } else if (w <= 200) {
                    maxPacks = 2;
                } else {
                    maxPacks = 1;
                }

                for (let qty = 1; qty <= maxPacks; qty++) {
                    const packVariant = { ...merged };
                    if (maxPacks > 1) {
                        packVariant.variant_type = "Quantity";
                        packVariant.variant_value = `Pack of ${qty}`;
                        packVariant.parent_asin = merged.asin;
                        if (qty === 1) {
                            packVariant.name = `${merged.name} (Pack of 1)`;
                        }
                    }
                    if (qty > 1) {
                        packVariant.asin = `${merged.asin}-P${qty}`;
                        packVariant.name = `${merged.name} (Pack of ${qty})`;
                        packVariant.price_inr = merged.price_inr * qty;
                        if (packVariant.original_price_inr) {
                             packVariant.original_price_inr = packVariant.original_price_inr * qty;
                        }
                        if (packVariant.weight_grams) {
                             packVariant.weight_grams = packVariant.weight_grams * qty;
                        }
                        if (packVariant.volume_ml) {
                             packVariant.volume_ml = packVariant.volume_ml * qty;
                        }
                        if (packVariant.net_quantity) {
                             const netMatch = String(packVariant.net_quantity).match(/^([\d.]+)(.*)$/);
                             if (netMatch) {
                                  packVariant.net_quantity = `${parseFloat(netMatch[1]) * qty}${netMatch[2]}`;
                             }
                        }
                    }
                    const sanitized = deepSanitizeProduct(packVariant);
                    if (!acceptProduct(sanitized)) continue;
                }
            }
            fetched++;



          } else {
            failed++;
          }
        } catch (mergeErr) {
          console.warn(`  SKIP ${currentItem.asin}: merge error — ${mergeErr.message}`);
          failed++;
        }
      } else {
        if (res.status === "rejected") console.warn(`  FAILED ${currentItem.asin}: ${res.reason?.message}`);
        failed++;
      }
    }
    process.stdout.write(`\r  Progress: ${fetched + failed}/${queue.length} (${fetched} ok, ${failed} failed)`);
    if (i + concurrency < queue.length) await new Promise(r => setTimeout(r, delayMs));
  }
  process.stdout.write("\n");

  await Bun.write("m1-m3-output.json", JSON.stringify(products, null, 2));
  console.log(`\nSaved → m1-m3-output.json (${products.length} products)`);

  return products;
}

if (import.meta.main) {
  // CLI Overrides: bun m1-m3-scraper.js --keyword "Redensyl" --max-pages 2 --min-rating 4.2 --start-page 1
  const args = process.argv.slice(2);
  const argMap = {};
  for (let i = 0; i < args.length; i += 2) {
    if (args[i].startsWith("--")) argMap[args[i].slice(2)] = args[i + 1];
  }

  const k = (argMap.keyword || KEYWORD).toLowerCase().trim();
  const mr = parseFloat(argMap["min-rating"]) || MIN_RATING;
  const mp = parseInt(argMap["max-pages"]) || 3;
  const sp = parseInt(argMap["start-page"]) || 1;

  runScraper(k, null, mr, CONCURRENCY, DELAY_MS, mp, sp).catch(err => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}
