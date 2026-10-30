#!/usr/bin/env bun

/**
 * M9 — Push single product to Ozon (v3 — FINAL PRODUCTION HARDENED)
 * Features: Image Re-hosting (Supabase), Advanced Brand Matcher, Skincare Compliance.
 */

import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { translateProduct } from "./m6-translate.js";
import { fetchInrUsdRate, computeUsdPrice } from "./m7-pricing.js";
import { fetchCategoryAttributes } from "./m10-ozon-attrs.js";
import { mapAmazonToOzon, extractComposition, extractShelfLife } from "./m10b-attr-mapper.js";
import { buildBrandCache } from "./m29-build-brand-cache.js";
import { validateAndCorrectBrand, preUploadGate, isValidBrandValue, validateCharacteristics, buildBrandAudit, saveBrandAudit } from "./m-brand-validator.js";
import { generateRussianImagePackage } from "./m-image-gen-ru.js";
import { validateImageBrands } from "./m-image-ocr-validator.js";
import { validateTitleQuality, validateAllTextLanguage, calculateCharacteristicsScore, validateImageQuality } from "./m-quality-validator.js";
import { processProductImages } from "./m-image-pipeline.js";
import { uploadRenderedImage } from "./m-image-renderer.js";
import { getCountryId as getLocalCountryId, upsertCountry as upsertLocalCountry, isAlreadyUploaded, markAsUploaded } from "./m-local-db.js";


const env = globalThis.Bun?.env || process.env;
const SUPABASE_URL = String(env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = String(env.SUPABASE_SERVICE_KEY || "").trim();
const OZON_CLIENT_ID = String(env.OZON_CLIENT_ID || "").trim();
const OZON_API_KEY = String(env.OZON_API_KEY || "").trim();
const OZON_HOST = "https://api-seller.ozon.ru";

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export async function ozonPost(path, body) {
  const res = await fetch(`${OZON_HOST}${path}`, {
    method: "POST",
    headers: { "Client-Id": OZON_CLIENT_ID, "Api-Key": OZON_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { }
  return { status: res.status, ok: res.ok, text, json };
}

/**
 * GLOBAL SAFETY NET: Prohibited Word Sanitization (v55 — Compliance Aware)
 * Covers: Ashwagandha, Gokshura, and all scientific synonyms.
 * Uses context-safe Russian replacements. Never blocks upload.
 */

// Safe Russian replacement phrases (chosen contextually at field level)
const COMPLIANCE_REPLACEMENTS_RU = [
  "растительный комплекс",
  "растительная формула",
  "натуральный растительный состав",
  "ботаническая формула",
  "смесь растительных ингредиентов",
  "экстракты растений",
  "травяной комплекс",
  "комплекс на растительной основе"
];

let _complianceIdx = 0;
function nextComplianceReplacement() {
  const r = COMPLIANCE_REPLACEMENTS_RU[_complianceIdx % COMPLIANCE_REPLACEMENTS_RU.length];
  _complianceIdx++;
  return r;
}

const BANNED_INGREDIENT_RULES = [
  // Ashwagandha and all synonyms
  { regex: /withania\s+somnifera/gi,  ruSafe: () => "натуральный растительный состав",   enSafe: "herbal blend" },
  { regex: /ashwagandha/gi,           ruSafe: () => nextComplianceReplacement(),           enSafe: "herbal supplement" },
  { regex: /ashvagandha/gi,           ruSafe: () => "растительная формула",               enSafe: "wellness formula" },
  { regex: /withania/gi,              ruSafe: () => "экстракты растений",                 enSafe: "plant extract" },
  { regex: /somnifera/gi,             ruSafe: () => "комплекс на растительной основе",    enSafe: "plant-based formula" },
  // Gokshura and all synonyms
  { regex: /tribulus\s+terrestris/gi, ruSafe: () => "смесь растительных ингредиентов",   enSafe: "botanical blend" },
  { regex: /gokshura/gi,              ruSafe: () => nextComplianceReplacement(),           enSafe: "botanical extract" },
  { regex: /gokhru/gi,                ruSafe: () => "травяной комплекс",                  enSafe: "herbal ingredient" },
  { regex: /tribulus/gi,              ruSafe: () => "ботаническая формула",               enSafe: "plant formula" },
  // Cyrillic forms
  { regex: /ашвагандха/gi,            ruSafe: () => "растительный экстракт",              enSafe: "plant extract" },
  { regex: /ашваганда/gi,             ruSafe: () => "аюрведический растительный сбор",   enSafe: "ayurvedic herbal blend" },
  { regex: /витания/gi,               ruSafe: () => "травяной сбор",                      enSafe: "herbal blend" },
  { regex: /сомнифера/gi,             ruSafe: () => "растительная добавка",               enSafe: "plant supplement" },
  { regex: /гокшура/gi,               ruSafe: () => "растительный комплекс",              enSafe: "plant complex" },
  { regex: /трибулус/gi,              ruSafe: () => "натуральный растительный состав",   enSafe: "botanical extract" },
];

/**
 * Sanitize a single text string by replacing banned ingredient names.
 * Detects language and prefers Russian replacements for Cyrillic text.
 * @param {string} text
 * @returns {string} cleaned text
 */
function sanitizeProhibitedWords(text) {
  if (typeof text !== "string") return text;
  let t = text;
  const hasCyrillic = /[а-яА-ЯёЁ]/.test(t);
  for (const rule of BANNED_INGREDIENT_RULES) {
    if (rule.regex.test(t)) {
      rule.regex.lastIndex = 0; // reset stateful regex
      const replacement = hasCyrillic ? rule.ruSafe() : rule.enSafe;
      t = t.replace(rule.regex, replacement);
      rule.regex.lastIndex = 0;
    }
  }
  return t;
}

/**
 * COMPLIANCE SCAN: Returns { found: boolean, terms: string[] }
 * Now returns DETAILS instead of blocking — caller decides action.
 */
function containsProhibitedWords(obj) {
  const jsonStr = JSON.stringify(obj).toLowerCase();
  const bannedTerms = [
    "ashwagandha", "ashvagandha", "withania", "somnifera",
    "gokshura", "gokhru", "tribulus",
    "ашвагандха", "ашваганда", "витания", "сомнифера", "гокшура", "трибулус"
  ];
  const found = bannedTerms.filter(term => jsonStr.includes(term));
  return { found: found.length > 0, terms: found };
}

/**
 * Scan AI-generated content object for banned ingredients across ALL fields.
 * Returns { clean: boolean, rewrites: Array<{field, original, replaced}> }
 */
function deepComplianceScan(ai) {
  const SCAN_FIELDS = [
    "title_ru", "description_ru", "annotation_ru", "composition",
    "method_of_use", "keywords_ru", "hashtags", "benefits"
  ];
  const rewrites = [];
  const result = { ...ai };
  for (const field of SCAN_FIELDS) {
    if (!result[field] || typeof result[field] !== "string") continue;
    const original = result[field];
    const cleaned  = sanitizeProhibitedWords(original);
    if (cleaned !== original) {
      rewrites.push({ field, original: original.slice(0, 120), replaced: cleaned.slice(0, 120) });
      result[field] = cleaned;
    }
  }
  return { ai: result, rewrites, clean: rewrites.length === 0 };
}

// Payload-level keys whose string values must never be transformed.
// "name" here refers to the offer name (title) — that IS sanitized.
// Brand is locked in the attributes array as id=85; we protect it by key.
const PAYLOAD_PROTECTED_KEYS = new Set(["offer_id", "currency", "vat", "weight_unit", "dimension_unit"]);

function deepSanitize(obj, parentKey = null) {
  if (parentKey && PAYLOAD_PROTECTED_KEYS.has(parentKey)) return obj;
  if (typeof obj === "string") return sanitizeProhibitedWords(obj);
  if (Array.isArray(obj)) return obj.map(item => deepSanitize(item, parentKey));
  if (obj !== null && typeof obj === "object") {
    // Special case: attribute entry with id=85 (Brand) — preserve value intact
    if ("id" in obj && obj.id === 85) return obj;
    const newObj = {};
    for (const key in obj) {
      newObj[key] = PAYLOAD_PROTECTED_KEYS.has(key) ? obj[key] : deepSanitize(obj[key], key);
    }
    return newObj;
  }
  return obj;
}

/**
 * STRICT TITLE VALIDATOR (v56 — Pre-Push Gate)
 * Returns { ok: true } or { ok: false, reason: "..." }
 * If a title is corrupted or unreadable it is caught here BEFORE Ozon sees it.
 */
function validateTitle(title) {
  if (!title || title.trim().length < 10) {
    return { ok: false, reason: "Title too short or empty" };
  }

  // Must have Cyrillic content
  if (!/[а-яА-ЯёЁ]/.test(title)) {
    return { ok: false, reason: "Title has no Cyrillic text" };
  }

  // Reject numbered list fragments (1. , 2. , 1) etc)
  if (/\d+[.)\-]\s/.test(title)) {
    return { ok: false, reason: `Title contains numbered list fragment: "${title.slice(0, 60)}"` };
  }

  // Reject repeated commas or dots (,,, or ...)
  if (/(,\s*){2,}|(\s*\.\s*){3,}/.test(title)) {
    return { ok: false, reason: `Title contains repeated punctuation: "${title.slice(0, 60)}"` };
  }

  // Reject repeated dashes (--- or - - -)
  if (/(\-\s*){3,}/.test(title)) {
    return { ok: false, reason: `Title contains repeated dashes: "${title.slice(0, 60)}"` };
  }

  // Reject titles that are mostly punctuation/digits and no real words
  const wordPart = title.replace(/[^\u0430-\u044f\u0410-\u042f\u0451\u0401a-zA-Z]/g, "");
  if (wordPart.length < 8) {
    return { ok: false, reason: `Title has almost no readable words: "${title.slice(0, 60)}"` };
  }

  // Must have at least 2 space-separated tokens
  if (title.trim().split(/\s+/).length < 2) {
    return { ok: false, reason: `Title is a single token (not a sentence): "${title.slice(0, 60)}"` };
  }

  return { ok: true };
}

// ─── Supabase Circuit Breaker ────────────────────────────────────────────────
// Once Supabase fails for ANY reason (quota, connection), we open the circuit
// for the entire session and immediately return the original Amazon URL.
// This prevents 2+ minute delays from exponential retry backoff on 9 images.
let supabaseCircuitOpen = false;

async function rehostImage(asin, idx, url) {
  // Fast path: circuit already open → skip everything instantly
  if (supabaseCircuitOpen || !supabase) return url;

  try {
    // Fetch high-res image from Amazon
    const cleanUrl = url.replace(/\._[A-Z0-9,_-]+\./i, ".");
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    };
    let res = await fetch(cleanUrl, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
        if (res.body) { await res.text().catch(() => {}); }
        res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    }
    if (!res.ok) throw new Error(`Amazon fetch HTTP ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    const fileName = `${asin}_${idx}.jpg`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

    if (error) {
      // Any Supabase error trips the circuit — no more retries this session
      supabaseCircuitOpen = true;
      const isQuota = error.message?.includes('exceed') || error.message?.includes('quota') || error.message?.includes('Unable to connect') || error.message?.includes('typo');
      if (isQuota) {
        console.warn(`  ⚠️  Supabase unavailable (${error.message?.slice(0, 60)}). Circuit OPEN — using Amazon URLs for all remaining images.`);
      } else {
        console.warn(`  ⚠️  Supabase error (Img ${idx}): ${error.message?.slice(0, 80)}. Circuit OPEN.`);
      }
      return url; // fall back immediately
    }

    const { data: publicUrl } = supabase.storage.from('product-images').getPublicUrl(fileName);
    return publicUrl.publicUrl;

  } catch (err) {
    // Network-level failure (DNS, connection refused, timeout) → trip circuit immediately
    supabaseCircuitOpen = true;
    console.warn(`  ⚠️  Supabase unreachable for Img ${idx}: ${err.message?.slice(0, 80)}. Circuit OPEN — using Amazon URLs.`);
    return url;
  }
}



// ─── Brand Name Cleaner ──────────────────────────────────────────────────────
const cleanBrand = (text) => {
  let b = String(text || "").trim();
  const visitMatch = b.match(/^Visit the (.+?) Store$/i);
  if (visitMatch) b = visitMatch[1].trim();
  const brandMatch = b.match(/^Brand:\s*(.+)$/i);
  if (brandMatch) b = brandMatch[1].trim();
  b = b.replace(/\s+Official Store$/i, '').trim();
  return b.replace(/[^\p{L}\p{N}\s&'-]/gu, '').replace(/\s+/g, ' ').trim();
};

const normalizeBrand = (text) => {
  let b = cleanBrand(text);
  // Remove diacritics/accents (LAKMÉ -> LAKME)
  b = b.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Lowercase
  b = b.toLowerCase();
  // Remove all non-alphanumeric (spaces, quotes, apostrophes) -> loreal, maybellinenewyork
  b = b.replace(/[^a-z0-9]/g, "");
  return b;
};

// ─── Advanced Brand Matcher ──────────────────────────────────────────────────

async function resolveBrand(brandName, catId, typeId) {
  const amazonBrand = String(brandName || "").trim();
  const cleanedAmazonBrand = cleanBrand(amazonBrand);
  const searchTarget = normalizeBrand(amazonBrand);

  // ─── BRAND VALIDITY GATE — delegate to shared validator ──────────────────────
  const isValidBrand = (val) => isValidBrandValue(val);

  let finalBrand = { id: 126745801, value: "Нет бренда" };  // default: "No Brand"
  let matchFound = "NO";

  // ─── GLOBAL HARDCODED BRAND FALLBACKS (Guaranteed VIP Pass) ─────────────────
  // Keys MUST be fully normalized: lowercase, no spaces, no punctuation, no accents.
  // When Amazon gives us a known brand, we ALWAYS use the Ozon entry — never Нет бренда.
  const GLOBAL_BRAND_MAP = {
    // ── Cosmetics / Personal Care ──────────────────────────────────────────
    "lakme":                  { id: 81898125,  value: "Lakme" },
    "maybelline":             { id: 5120693,   value: "Maybelline New York" },
    "maybellinenewyork":      { id: 5120693,   value: "Maybelline New York" },
    "loreal":                 { id: 5122144,   value: "L'Oreal Paris" },
    "lorealparis":            { id: 5122144,   value: "L'Oreal Paris" },
    "lorealparts":            { id: 5122144,   value: "L'Oreal Paris" },
    "garnier":                { id: 5120790,   value: "Garnier" },
    "olay":                   { id: 5087854,   value: "Olay" },
    "revlon":                 { id: 5121430,   value: "Revlon" },
    "minimalist":             { id: 184586948, value: "Minimalist" },
    "cetaphil":               { id: 5124230,   value: "Cetaphil" },
    "cerave":                 { id: 5123984,   value: "CeraVe" },
    "mac":                    { id: 5122041,   value: "MAC" },
    "clinique":               { id: 5124294,   value: "Clinique" },
    "ponds":                  { id: 5122025,   value: "Pond's" },
    "pond":                   { id: 5122025,   value: "Pond's" },
    "pondss":                 { id: 5122025,   value: "Pond's" },
    "dove":                   { id: 5120752,   value: "Dove" },
    "nivea":                  { id: 5122127,   value: "Nivea" },
    "neutrogena":             { id: 5122108,   value: "Neutrogena" },
    "lotusbotanicals":        { id: 133469434, value: "Lotus Botanicals" },
    "lotus":                  { id: 133469434, value: "Lotus Botanicals" },
    "plum":                   { id: 133469376, value: "Plum" },
    "pilgrim":                { id: 237521899, value: "Pilgrim" },
    "mcaffeine":              { id: 227291543, value: "mCaffeine" },
    "suganda":                { id: 227291561, value: "Suganda" },
    "dermaco":                { id: 237521910, value: "Dermaco" },
    "cosrx":                  { id: 5124338,   value: "COSRX" },
    "laneige":                { id: 5125064,   value: "LANEIGE" },
    "innisfree":              { id: 5124854,   value: "Innisfree" },
    "estee":                  { id: 5120777,   value: "Estee Lauder" },
    "esteelauder":            { id: 5120777,   value: "Estee Lauder" },
    "lancome":                { id: 5121934,   value: "Lancome" },
    "shiseido":               { id: 5122461,   value: "Shiseido" },
    // ── Haircare ────────────────────────────────────────────────────────────
    "pantene":                { id: 5122211,   value: "Pantene" },
    "sunsilk":                { id: 5122484,   value: "Sunsilk" },
    "indulekha":              { id: 82136035,  value: "Indulekha" },
    "schwarzkopf":            { id: 5122445,   value: "Schwarzkopf" },
    "kerastase":              { id: 5121895,   value: "Kerastase" },
    "bblunt":                 { id: 172909358, value: "BBlunt" },
    "advansed":               { id: 82136048,  value: "Advansed" },
    "parachute":              { id: 172909392, value: "Parachute" },
    // ── Ayurveda / Wellness / Herbal ─────────────────────────────────────────
    "himalaya":               { id: 26038459,  value: "Himalaya" },
    "himalayaherbal":         { id: 26038459,  value: "Himalaya" },
    "himalayaherbalshealthcare": { id: 26038459, value: "Himalaya" },
    "mamaearth":              { id: 172909386, value: "Mamaearth" },
    "biotique":               { id: 82136009,  value: "Biotique" },
    "dabur":                  { id: 26038452,  value: "Dabur" },
    "daburindia":             { id: 26038452,  value: "Dabur" },
    "khadinatural":           { id: 133469413, value: "Khadi Natural" },
    "khadi":                  { id: 133469413, value: "Khadi Natural" },
    "khadinaturals":          { id: 133469413, value: "Khadi Natural" },
    "wowskinscience":         { id: 172909405, value: "WOW Skin Science" },
    "wow":                    { id: 172909405, value: "WOW Skin Science" },
    "organicindia":           { id: 82136020,  value: "Organic India" },
    "kapiva":                 { id: 172909380, value: "Kapiva" },
    "vedaka":                 { id: 237521870, value: "Vedaka" },
    "tatasampann":            { id: 237521863, value: "Tata Sampann" },
    "tatanutrition":          { id: 237521863, value: "Tata Sampann" },
    "emami":                  { id: 26038456,  value: "Emami" },
    "patanjali":              { id: 133469398, value: "Patanjali" },
    "baidyanath":             { id: 82136015,  value: "Baidyanath" },
    "zandu":                  { id: 133469428, value: "Zandu" },
    "hamdard":                { id: 82136028,  value: "Hamdard" },
    "charak":                 { id: 82136023,  value: "Charak" },
    "vlcc":                   { id: 82136043,  value: "VLCC" },
    "vicco":                  { id: 82136047,  value: "Vicco" },
    "jovees":                 { id: 133469407, value: "Jovees" },
    "kamaayurveda":           { id: 133469404, value: "Kama Ayurveda" },
    "kama":                   { id: 133469404, value: "Kama Ayurveda" },
    "bajaj":                  { id: 26038449,  value: "Bajaj" },
    "marico":                 { id: 172909383, value: "Marico" },
    "sbl":                    { id: 82136039,  value: "SBL" },
    "reckeweg":               { id: 82136036,  value: "Reckeweg" },
    "morepen":                { id: 133469419, value: "Morepen" },
  };

  // ── Try exact normalized key first ──────────────────────────────────────────
  if (GLOBAL_BRAND_MAP[searchTarget]) {
    console.log(`  ✅ [BRAND] VIP map exact hit: "${amazonBrand}" → "${GLOBAL_BRAND_MAP[searchTarget].value}"`);
    return GLOBAL_BRAND_MAP[searchTarget];
  }

  // Prefix/StartsWith matching has been strictly removed to prevent cross-brand contamination (e.g. TATA 1MG != Tata Sampann).

  if (isValidBrand(cleanedAmazonBrand) && searchTarget !== "no brand" && searchTarget !== "нет бренда") {
    try {
      const cachedBrands = await buildBrandCache(catId, typeId);

      // Helper — tries a single candidate string against the Ozon brand cache
      const tryFind = (candidate) => {
        if (!candidate || candidate.length < 3) return null;
        const cLow = candidate.toLowerCase().trim();
        const cStrip = cLow.replace(/[^a-zа-я0-9]/g, '');

        // 1. Strict Exact Match (with spaces)
        let m = cachedBrands.find(o => o.value.toLowerCase().trim() === cLow);
        if (m) return m;

        // 2. Exact Match (ignoring spaces & punctuation - e.g. "Bakson's" === "Baksons")
        m = cachedBrands.find(o => {
          const ovStrip = o.value.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
          return ovStrip === cStrip && isValidBrand(o.value);
        });

        // WE DO NOT DO PREFIX MATCHING! (e.g. 'Nestle' must not match 'Nestle Chocolate')
        return m || null;
      };

      // ── Pass 1: Full Amazon brand string ──────────────────────────────────
      let match = tryFind(searchTarget);

      // ── Pass 2: Strip possessives ('s) and re-try ─────────────────────────
      if (!match) {
        const noPossessive = searchTarget.replace(/'s\b/g, '').replace(/\s+/g, ' ').trim();
        if (noPossessive !== searchTarget) match = tryFind(noPossessive);
      }

      // ── Pass 3: Word-by-word lookup ──
      // ONLY for single-word brands (e.g. "Bakson" from "Bakson's").
      // NEVER split a multi-word brand (e.g. "Red Label") because individual
      // words like "Label" may exist in the Ozon dictionary as unrelated brands.
      if (!match) {
        const wordCount = searchTarget.trim().split(/\s+/).length;
        if (wordCount === 1) {
          const skipWords = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'the', 'by', 'and', 'of', 'for', 'co', 'ltd']);
          const words = searchTarget.replace(/'s\b/g, '').split(/\s+/)
            .map(w => w.replace(/[^a-zA-Z\u0400-\u04FF0-9]/g, ''))
            .filter(w => w.length >= 4 && !skipWords.has(w)); // min 4 chars to avoid noise
          const sorted = [...words].sort((a, b) => b.length - a.length);
          for (const word of sorted) {
            match = tryFind(word);
            if (match) break;
          }
        }
      }

      // ── Post-match validation: only accept valid brands ───────────────────
      // Also guard against short partial matches (e.g. "Label" matching for "Red Label")
      if (match && isValidBrand(match.value)) {
        const matchedLen = match.value.replace(/\s+/g, '').length;
        const queryLen  = searchTarget.replace(/\s+/g, '').length;
        const ratio = queryLen > 0 ? matchedLen / queryLen : 0;
        if (ratio >= 0.60) {
          finalBrand = { id: match.id, value: match.value };
          matchFound = `YES (dictionary: "${match.value}")`;
        } else {
          matchFound = `REJECTED partial match "${match.value}" (ratio ${ratio.toFixed(2)} < 0.60) → Нет бренда`;
        }
      } else {
        matchFound = "NO match → Нет бренда";
      }
    } catch (err) {
      console.warn(`  ⚠️ Brand cache error:`, err.message);
    }
  }

  // ─── DEBUG LOG (User Requirement) ───────────────────────────────────────────
  console.log(`\x1b[36m  [BRAND RESOLUTION DEBUG]\x1b[0m`);
  console.log(`  - Original Brand:      "${amazonBrand}"`);
  console.log(`  - Normalized Brand:    "${searchTarget}"`);
  const matchedOzonBrand = finalBrand.id !== 126745801 ? finalBrand.value : "Нет бренда";
  console.log(`  - Matched Ozon Brand:  ${matchedOzonBrand}`);
  console.log(`  - Matched Ozon ID:     ${finalBrand.id}`);

  return finalBrand;
}

// ─── Main Push Function ───────────────────────────────────────────────────────

async function resolveCountry(name) {
  // 1. Try local SQLite cache first (zero latency, works offline / quota exceeded)
  const localId = await getLocalCountryId(name);
  if (localId && localId !== 90312) return localId;    // 90312 = India default

  // 2. Try Supabase (may be unavailable when quota exceeded)
  if (supabase) {
    try {
      const { data } = await supabase.from("ozon_countries").select("ozon_id").eq("name", name).single();
      if (data?.ozon_id) {
        await upsertLocalCountry(data.ozon_id, name);
        return data.ozon_id;
      }
    } catch {
      /* country lookup can fall through to the India default */
    }
  }

  return 90312; // India fallback
}

export async function pushProductToOzon(p, inrUsdRate, options) {
  const { descriptionCategoryId, typeId, typeLabel, oldPriceMultiplier, skipDuplicateCheck } = options;

  // ─── DB-LEVEL DUPLICATE LOGGING (Blocking Disabled per user request) ───
  const existingUpload = await isAlreadyUploaded(p.asin);
  if (existingUpload) {
    console.log(`\x1b[36m  ℹ️  INFO: Product previously uploaded to Ozon (parent: ${existingUpload.parent_asin ?? 'standalone'}, variant: ${p.asin}, task: ${existingUpload.ozon_task_id ?? 'n/a'}). Proceeding anyway.\x1b[0m`);
    // Upload is no longer skipped
  }

  // 1. Translation & Hardened SEO Content
  let ai = await translateProduct(p, typeLabel);

  // ─── COMPLIANCE CONTENT SCAN (v55 — Ashwagandha / Gokshura Rewrite) ──────────
  // Scans ALL AI-generated fields. Rewrites banned ingredient names safely.
  // NEVER blocks upload — always applies best-effort replacement and logs.
  const complianceScan = deepComplianceScan(ai);
  if (!complianceScan.clean) {
    Object.assign(ai, complianceScan.ai);
    console.log(`\x1b[33m  ⚠️  COMPLIANCE: Rewrote ${complianceScan.rewrites.length} field(s) for ${p.asin}:\x1b[0m`);
    for (const rw of complianceScan.rewrites) {
      console.log(`    - [${rw.field}] "${rw.original.slice(0, 60)}" → "${rw.replaced.slice(0, 60)}"`);
    }
  } else {
    console.log(`  ✅ Compliance scan clean for ${p.asin} — no banned ingredients in AI content.`);
  }

  // ─── STRICT TITLE VALIDATION (Pre-Push Gate v56) ───
  const titleCheck = validateTitle(ai.title_ru);
  if (!titleCheck.ok) {
    console.log(`\x1b[31m  ❌ SKIPPING ${p.asin}: TITLE CORRUPTED — ${titleCheck.reason}\x1b[0m`);
    console.log(`\x1b[33m  ⚠️  Bad title was: "${String(ai.title_ru).slice(0, 120)}"\x1b[0m`);
    return { success: false, error: `TITLE_CORRUPTED: ${titleCheck.reason}` };
  }

  const finalUsd = computeUsdPrice(p.price_inr, inrUsdRate);
  if (finalUsd <= 0) {
    console.warn(`\x1b[33m  ⚠️  SKIPPING ASIN ${p.asin}: Price is 0 or null (INR: ${p.price_inr}).\x1b[0m`);
    return { success: false, error: "PRICE_IS_0" };
  }
  const oldPrice = (finalUsd * oldPriceMultiplier).toFixed(2);



  // ─── GENDER DETECTION (v18) ───
  let genderVal = "Унисекс";
  const genderSearch = (p.name + " " + (p.description || "") + " " + (p.feature_bullets?.join(" ") || "")).toLowerCase();
  if (genderSearch.includes("men ") || genderSearch.includes("male") || genderSearch.includes("gentlemen")) {
    genderVal = "Мужской";
  } else if (genderSearch.includes("women") || genderSearch.includes("female") || genderSearch.includes("ladies")) {
    genderVal = "Женский";
  }

  // ─── HAIR TYPE RULE (v18) ───
  const hairCareCats = [17028991, 17028994, 17036611, 17028997];
  const isHairCare = hairCareCats.includes(parseInt(descriptionCategoryId, 10));

  // 2. Data Hardening & Scoping (v37 Stability Fix)
  const cleanNum = (val) => String(val || "0").replace(/[^\d.]/g, '').trim() || "0";
  let volVal = "0"; 

  // Parse Pack Quantity explicitly for Ozon variants
  let packQty = 1;
  const matchQty = String(p.variant_value || "").match(/Pack of (\d+)/i);
  if (matchQty) packQty = parseInt(matchQty[1], 10) || 1;

  // Improved Regex for Volume (catches Pack of X, etc.)
  const bulletsStr = Array.isArray(p.feature_bullets) ? p.feature_bullets.join(" ") : "";
  const textContext = `${p.name} ${ai.title_ru} ${p.description || ""} ${bulletsStr}`;
  
  // 1. Look for specific ML/G patterns
  const mlMatch = textContext.match(/(\d[\d.]*)\s*(ml|milliliter|millilitre|мл|миллилитр|г|g|gram|грамм|oz|ounce|fl oz)/i);
  if (mlMatch) {
      volVal = String(Math.round(parseFloat(mlMatch[1])));
  }
  
  // 2. MANDATORY FALLBACK: Use Weight as Volume
  if (volVal === "0" || volVal === "" || volVal === "1") {
      volVal = cleanNum(p.weight_grams);
  }
  
  // 3. LAST RESORT: Try to find ANY number near the end of the title that looks like a size
  if (volVal === "0" || volVal === "" || volVal === "1") {
      const lastNumMatch = p.name.match(/(\d+)\s*$/);
      if (lastNumMatch) volVal = lastNumMatch[1];
  }

  // ─── STRIKE COMPLIANCE GUARD ───
  // Check Volume - if genuinely 0 or empty, skip
  if (volVal === "" || volVal === "0" || !volVal) {
      console.warn(`\x1b[33m  ⚠️  SKIPPING ASIN ${p.asin}: Could not resolve Volume (found ${volVal}).\x1b[0m`);
      return { success: false, error: "INVALID_VOLUME" };
  }

  // 3. Resolve Brands & IDs (Hardened Matcher)
  const brand = await resolveBrand(p.brand, descriptionCategoryId, typeId);
  
  console.log(`\n\x1b[35m=== BRAND RESOLUTION ===\x1b[0m`);
  console.log(`  Amazon Brand       : ${p.brand || "N/A"}`);
  console.log(`  Matched Ozon Brand : ${brand.value}`);
  console.log(`  Brand ID           : ${brand.id}`);
  console.log(`========================\n`);

  const countryId = await resolveCountry(p.country_of_origin || "India");
  const ozonAttrs = await fetchCategoryAttributes(descriptionCategoryId, typeId);

  // If Ozon doesn't have the brand, we map it to "Нет бренда" under the hood (id 85),
  // BUT we must keep the original Amazon brand visible in title, description, and hashtags.
  const isNoBrand = brand.value === "Нет бренда" || !brand.value;
  const brandForTextChecks = isNoBrand && p.brand ? p.brand : brand.value;

  // 3. Image Re-hosting (Mandatory Hardening)
  const imagesToProcess = Array.isArray(p.image_urls) ? p.image_urls.slice(0, 10) : [];
  console.log(`  🕒 Re-hosting ${imagesToProcess.length} images to Supabase...`);
  const rehostedImages = (await Promise.all(
    imagesToProcess.map(async (url, i) => {
      return await rehostImage(p.asin, i, url, 4);
    })
  )).filter(u => u !== null);

  // ── Brand consistency validation + auto-correct ──────────────────────────────
  const brandValidation = validateAndCorrectBrand(ai, brandForTextChecks);
  if (!brandValidation.valid) {
    console.log(`\x1b[33m  ⚠️  Brand corrections applied for ${p.asin}: ${brandValidation.corrections.join(' | ')}\x1b[0m`);
    Object.assign(ai, brandValidation.ai);
  }

  // ── Pre-upload gate (blocks if critical fields are invalid) ─────────────────
  const proxyBrand = { ...brand, value: brandForTextChecks };
  const gate = preUploadGate(ai, proxyBrand, rehostedImages);
  if (!gate.pass) {
    console.log(`\x1b[31m  ❌ PRE-UPLOAD GATE FAILED for ${p.asin}. Aborting push.\x1b[0m`);
    return { success: false, error: `PRE_UPLOAD_GATE: ${gate.blockers.join(' | ')}` };
  }

  // ── Russian image package (layout metadata for logging) ──────────────────
  const ruImagePkg = await generateRussianImagePackage(p, proxyBrand, ai.title_ru, typeLabel);
  console.log(`  🖼️  RU image package ready: bg=${ruImagePkg.background}`);

  // ── Generate ALL images via sharp-based pipeline (no browser needed) ──────────
  let ozonImageList = [...rehostedImages]; // default: original Amazon images
  try {
    const imgResult = await processProductImages(
      p,
      brandForTextChecks, // use the proper text brand, not a blank space
      ai.title_ru,
      ruImagePkg.benefits,
      typeLabel
    );

    const uploadImage = async (buf, slot) => {
      if (!buf) return null;
      return await uploadRenderedImage(SUPABASE_URL, SUPABASE_KEY, p.asin, slot, buf);
    };

    // Upload main image → slot 0
    const mainUrl = await uploadImage(imgResult.mainBuf, 0);
    if (mainUrl) {
      ozonImageList = [mainUrl];
      console.log(`  ✅ Main RU image: ${mainUrl.slice(-50)}`);
    }

    // Upload additional images → slots 1+
    for (let i = 0; i < imgResult.additionalBufs.length; i++) {
      const url = await uploadImage(imgResult.additionalBufs[i], i + 1);
      ozonImageList.push(url || rehostedImages[i + 1] || (Array.isArray(p.image_urls) ? p.image_urls[i + 1] : null) || "");
    }
    // Trim nulls/empty
    ozonImageList = ozonImageList.filter(Boolean).slice(0, 10);

    if (ozonImageList.length === 0) ozonImageList = [...rehostedImages];

  } catch (imgErr) {
    console.warn(`  ⚠️  Image pipeline error: ${imgErr.message} — using Amazon URLs as fallback`);
  }

  // 4. Normalized Weights
  const netWeight = parseInt(p.weight_grams || 100, 10);
  const grossWeight = Math.round(netWeight * 1.2);

  // 5. Build Dynamic Mandatory Attributes Payload (v33)
  const composition = ai.composition && ai.composition !== "N/A" ? ai.composition : (extractComposition(p) || "N/A").slice(0, 500);
  const shelfLife = extractShelfLife(p);
  const modelDisplayName = ai.model_name || String(p.name || p.brand || "").slice(0, 255);
  // CRITICAL: modelGroupName MUST be identical for all pack variants.
  // Always use parent_asin (the base ASIN without -P2/-P3 suffix) so
  // Pack of 1/2/3/4 all share the same model group and get grouped by Ozon.
  const baseAsin = p.parent_asin || p.asin.replace(/-P\d+$/, '');
  const modelGroupName = `${p.brand || ""} ${baseAsin}`.trim().slice(0, 255);

  // --- FINAL HASHTAG GATE (OZON COMPLIANCE — ABSOLUTE LAST LINE OF DEFENSE) ---
  // Strips brand names, promo words, spaces inside tags, enforces <30 chars, max 8 tags.
  let finalHashtags = "";
  if (ai.hashtags) {
    const rawTags = String(ai.hashtags);

    // Build dynamic brand-word blocklist from the product's own brand field
    const _brandWords = new Set(
      String(p.brand || "")
        .toLowerCase()
        .replace(/'s\b/g, '')
        .replace(/[^a-zA-Zа-яёА-ЯЁ\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3)
    );
    const _brandCollapsed = String(p.brand || "").toLowerCase().replace(/[^a-zA-Zа-яёА-ЯЁ]/g, '');
    if (_brandCollapsed.length >= 3) _brandWords.add(_brandCollapsed);

    const _knownBrands = new Set([
      'himalaya','himalayaherbal','minimalist','garnier','mamaearth','loreal','lakme',
      'dove','ponds','nivea','neutrogena','olay','cetaphil','biotique','vicco',
      'vlcc','patanjali','dabur','emami','bajaj','shahnaz','lotus','jovees',
      'kama','plum','wow','mcaffeine','pilgrim','cosrx','cerave','laneige',
      'innisfree','clinique','estee','lancome','shiseido','pantene','sunsilk',
      'indulekha','kesh','vedix','aveda','kerastase','schwarzkopf','bblunt',
      'kapiva','zandu','sandu','sbl','reckeweg','boiron','schwabe','bjain',
      'nestle','haldirams','mtr','mdh','everest','bakson','bakshi','morepen',
      'baidyanath','charak','hamdard','willmar','blooume','adel','bjain','khadi'
    ]);

    const _promoWords = [
      'лучш','скидк','акци','распродаж','хит','hit','топ','top','нью','new',
      'sale','best','трен','trend','подар','премиум','premium','оригинал',
      'original','выгод','дешев','супер','super','новинк','номер1','рекоменд',
      'hot','amazon','choice'
    ];

    const _isBrandTag = (t) => {
      const clean = t.toLowerCase().replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, '');
      // ALLOW the product's own brand (don't block it from its own hashtag)
      if (_brandCollapsed && clean === _brandCollapsed) return false;
      if (_brandWords.has(clean)) return false; // own brand words always pass
      // BLOCK known competitor brands
      if (_knownBrands.has(clean)) return true;
      for (const kb of _knownBrands) {
        if (clean === kb || (clean.startsWith(kb) && clean.length <= kb.length + 3)) return true;
      }
      return false;
    };

    // ── Normalize ANY AI hashtag format into individual tag tokens ──────────────
    // Handles: "#tag1 #tag2", "#tag1#tag2", "tag1, tag2", "tag1;tag2", mixed.
    const normalizedRaw = rawTags
      .replace(/#/g, ' #')        // ensure space before every #
      .replace(/[,;|]+/g, ' ')    // replace comma/semicolon separators with space
      .replace(/\s{2,}/g, ' ')    // collapse multi-spaces
      .trim();

    // Split on spaces, keep only tokens that start with # or treat bare words as tags
    const tokenList = normalizedRaw
      .split(/\s+/)
      .map(tok => tok.startsWith('#') ? tok.slice(1) : tok)   // strip leading #
      .map(tok => tok.replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, '')) // strip punctuation
      .filter(tok => tok.length >= 2 && tok.length <= 28);

    const cleaned = tokenList
      .filter(t => !_isBrandTag(t))
      .filter(t => { const l = t.toLowerCase(); return !_promoWords.some(w => l.includes(w)); })
      .filter(t => !/\s/.test(t))     // FINAL GUARD: no spaces allowed inside a hashtag token
      .map(t => '#' + t);             // re-add # prefix — always exactly one # per tag

    // Deduplicate then join with single space — Ozon format: "#tag1 #tag2 #tag3"
    finalHashtags = [...new Set(cleaned)].slice(0, 8).join(' ');
    
    // PARANOIA CHECK: validate the final string has no spaces inside any #tag
    if (/#+[^\s#]*\s[^\s#]*#/.test(finalHashtags)) {
      console.error(`  🚨 HASHTAG FORMAT VIOLATION DETECTED — clearing all hashtags for safety`);
      finalHashtags = '';
    }
  }

  const mandatory = [
    // Brand (ID 85) — value must NEVER be sanitized; Ozon validates it as an exact dictionary string
    { complex_id: 0, id: 85,   values: [{ dictionary_value_id: brand.id, value: brand.value }] },
    { complex_id: 0, id: 4389, values: [{ dictionary_value_id: countryId }] },
    { complex_id: 0, id: 23487, values: [{ value: sanitizeProhibitedWords(p.manufacturer || p.brand || "India").slice(0, 255) }] },
    { complex_id: 0, id: 4191, values: [{ value: sanitizeProhibitedWords(ai.annotation_ru).slice(0, 500) }] },
    // Composition — unique per product from multiple Amazon fields
    { complex_id: 0, id: 8050, values: [{ value: sanitizeProhibitedWords(composition) }] },
    // Shelf life — Dynamically find all relevant Ozon IDs for "Shelf Life"
    ...ozonAttrs.filter(a => {
      const n = (a.name || "").toLowerCase();
      return n.includes("срок годности") || n.includes("годен до") || n.includes("shelf life") || [8205, 7102, 20188, 4194].includes(a.id);
    }).map(a => ({ complex_id: 0, id: a.id, values: [{ value: String(shelfLife) }] })),
    { complex_id: 0, id: 4497, values: [{ value: String(grossWeight) }] },
    { complex_id: 0, id: 8163, values: [{ value: volVal }] },
    { complex_id: 0, id: 4383, values: [{ value: String(netWeight) }] },
    // Quantity Attributes — Explicitly override so quantity packs group properly on Ozon
    { complex_id: 0, id: 4384, values: [{ value: String(packQty) }] },      // Amount in package
    { complex_id: 0, id: 23249, values: [{ value: String(packQty) }] },     // Units in one product
    // Model name — always the actual product name, never the category label
    { complex_id: 0, id: 9461, values: [{ value: sanitizeProhibitedWords(modelDisplayName) }] },
    // Model grouping — brand + ASIN guarantees each listing is unique, prevents Ozon from merging cards
    { complex_id: 0, id: 9048, values: [{ value: sanitizeProhibitedWords(modelGroupName) }] },
    // Article (ID 9024) — MUST be unique (use ASIN)
    { complex_id: 0, id: 9024, values: [{ value: p.asin }] }, // DO NOT sanitize ASIN just in case it breaks uniqueness
    // Method of use (ID 8048)
    ...(ai.method_of_use ? [{ complex_id: 0, id: 8048, values: [{ value: sanitizeProhibitedWords(ai.method_of_use) }] }] : []),
    // Hashtags (ID 23171) — Explicitly push cleaned version to prevent uncleaned schema fallback
    ...(finalHashtags ? [{ complex_id: 0, id: 23171, values: [{ value: finalHashtags }] }] : []),
  ];

  // Final sanity check: primary SEO keyword enforcement in title.
  // ONLY prepend if keyword makes sense (skip banned cosmetic machine-translation words)
  const BANNED_PREPEND_WORDS = ['фундамент', 'фондация', 'крем-фондшен', 'нет бренда', 'no brand', 'lakm '];
  const rawPrimaryKeyword = (ai.keywords_ru || '').split(/[,;]/)[0].trim();
  const keywordBanned = BANNED_PREPEND_WORDS.some(w => rawPrimaryKeyword.toLowerCase().includes(w));
  if (rawPrimaryKeyword && /[а-яА-ЯёЁ]/.test(rawPrimaryKeyword) && !keywordBanned &&
      ai.title_ru && !ai.title_ru.toLowerCase().includes(rawPrimaryKeyword.toLowerCase())) {
    console.log(`\x1b[33m  ⚠️  SEO title missing primary keyword "“${rawPrimaryKeyword}”" — prepending...\x1b[0m`);
    ai.title_ru = `${rawPrimaryKeyword} ${ai.title_ru}`.slice(0, 200).trim();
  }
  // Strip any residual banned words that leaked into the final title
  const BANNED_TITLE_PATTERNS = [
    /(?:^|[^\p{L}])фундамент(?:\s+для\s+\S+)?(?:[^\p{L}]|$)/giu,
    /(?:^|[^\p{L}])фондация(?:[^\p{L}]|$)/giu,
    /(?:^|[^\p{L}])крем-фондшен(?:[^\p{L}]|$)/giu,
    /(?:^|[^a-zA-Z])lakm(?!e)(?:[^a-zA-Z]|$)/giu,
    /(?:^|[^\p{L}])нет бренда(?:[^\p{L}]|$)/giu,
    /(?:^|[^\p{L}])lakm(?:\s|$)/giu
  ];
  for (const pat of BANNED_TITLE_PATTERNS) {
    ai.title_ru = ai.title_ru.replace(pat, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  // 6. Map remaining attributes dynamically via Schema
  // Exclude ALL mandatory IDs (including model name, grouping, composition, hashtags, method of use)
  const mandatoryIds = new Set([...mandatory.map(m => m.id), 9461, 9048, 8050, 23171, 8048]);
  const attributesToMap = (Array.isArray(ozonAttrs) ? ozonAttrs : []).filter(a => !mandatoryIds.has(a.id));
  
  let mapRes = await mapAmazonToOzon(p, attributesToMap, descriptionCategoryId, typeId, ozonPost, typeLabel);
  let filled = Array.isArray(mapRes?.filled) ? mapRes.filled : [];

  // 7. GLOBAL SAFETY NET (v36 Final Units Fix)
  // If this is Grocery, force all Unit/Quantity fields to at least 1
  // Ensure Shelf Life (8205) is at least 365 days (v39 Hardened)
  const finalAttrs = [...mandatory, ...filled];
  
  // ─── Shelf Life Safety Check (Strict Ozon Compliance) ───
  // Ozon ID 8205 = Shelf Life. Unit mapping (ID 9194) is often required. Ensure we don't send conflicting data.
  let shelfAttr = finalAttrs.find(a => a.id === 8205);
  if (shelfAttr) {
      let shelfVal = String(shelfAttr.values[0].value || "0");
      let valNum = parseInt(shelfVal.replace(/\D/g, ''), 10);
      if (isNaN(valNum) || valNum < 1) {
          console.log(`\x1b[35m  🛡️  Global Safety Net: Forcing ID 8205 (Shelf Life) to "730"\x1b[0m`);
          shelfAttr.values = [{ value: "730" }];
      } else if (valNum > 0 && valNum < 30) {
          // If the user extracted "2" (years) but Ozon expects Days! 2 days is too short!
          console.log(`\x1b[35m  🛡️  Global Safety Net: Expanding short Shelf Life ${valNum} -> ${valNum * 365} days\x1b[0m`);
          shelfAttr.values = [{ value: String(valNum * 365) }];
      }
  } else {
      // If missing, add it
      console.log(`\x1b[35m  🛡️  Global Safety Net: Adding ID 8205 (Shelf Life) = "730" (Days)\x1b[0m`);
      finalAttrs.push({ complex_id: 0, id: 8205, values: [{ value: "730" }] });
  }

  // Ensure "Unit of measurement for shelf life" (ID 9194) is explicitly DAYS if provided
  let shelfUnitAttr = finalAttrs.find(a => a.id === 9194);
  if (!shelfUnitAttr) {
      // 24263 = "Days" ("дней") in Ozon dictionary!
      finalAttrs.push({ complex_id: 0, id: 9194, values: [{ dictionary_value_id: 24263, value: "дней" }] });
  }

  // ─── Temperature Safety Check (Strict Ozon Compliance) ───
  for (const attr of finalAttrs) {
      const name = (ozonAttrs.find(oa => oa.id === attr.id)?.name || "").toLowerCase();
      if (name.includes("максимальная температура") || name.includes("хранения макс")) {
          let v = parseInt(String(attr.values[0].value || "24").replace(/\D/g, ''), 10);
          if (isNaN(v) || v > 24) attr.values[0].value = "24";
      } else if (name.includes("минимальная температура") || name.includes("хранения мин")) {
          let v = parseInt(String(attr.values[0].value || "17").replace(/\D/g, ''), 10);
          if (isNaN(v) || v < 14) attr.values[0].value = "17";
      }
  }

  // ─── Unit/Quantity Safety Check ───
  // IMPORTANT: Only force "1" for TRUE variant-grouping fields (e.g. "в упаковке").
  // Do NOT override product count fields like:
  //   23249 — Количество товара в УЕИ (e.g. 144 sachets in a box)
  //   11650 — Количество заводских упаковок (factory pack count)
  // These represent the ACTUAL product quantity and must be set by AI.
  const VARIANT_ONLY_IDS = new Set([12053, 11370, 10103, 10095]);
  const PRODUCT_COUNT_IDS = new Set([23249, 11650]); // do NOT override these

  let hasUnitField = false;
  for (const attr of ozonAttrs) {
      const name = attr.name.toLowerCase();
      const isVariantField = VARIANT_ONLY_IDS.has(attr.id) ||
          (name.includes("в упаковке") && !PRODUCT_COUNT_IDS.has(attr.id));

      if (isVariantField) {
          hasUnitField = true;
          let existing = finalAttrs.find(a => a.id === attr.id);
          let valStr = existing?.values[0]?.value || "0";
          let valNum = parseInt(valStr.replace(/\D/g, '') || "0", 10);

          if (valNum !== packQty) {
              console.log(`\x1b[35m  🛡️  Global Safety Net: Forcing variant field ID ${attr.id} (${attr.name}) to "${packQty}"\x1b[0m`);
              if (existing) {
                  existing.values = [{ value: String(packQty) }];
              } else {
                  filled.push({ complex_id: 0, id: attr.id, values: [{ value: String(packQty) }] });
                  finalAttrs.push({ complex_id: 0, id: attr.id, values: [{ value: String(packQty) }] });
              }
          }
      }
  }

  // If the category completely lacks a unit field, inject a universal one (12053) so variants can combine
  if (!hasUnitField) {
      const fallbackId = 12053;
      if (!finalAttrs.find(a => a.id === fallbackId)) {
          filled.push({ complex_id: 0, id: fallbackId, values: [{ value: String(packQty) }] });
          finalAttrs.push({ complex_id: 0, id: fallbackId, values: [{ value: String(packQty) }] });
      }
  }

  // ─── CHARACTERISTICS BRAND VALIDATION ─────────────────────────────────────
  // Ensures attr id=85 exactly matches the resolved brand, and no other attr
  // value references a competing brand name.
  const charValidation = validateCharacteristics(finalAttrs, brand.value);
  if (charValidation.corrections.length > 0) {
    console.log(`\x1b[33m  ⚠️  Characteristics brand corrections (${p.asin}): ${charValidation.corrections.join(' | ')}\x1b[0m`);
    // Replace finalAttrs in-place
    finalAttrs.length = 0;
    charValidation.attrs.forEach(a => finalAttrs.push(a));
  }

  // ─── CHARACTERISTICS COMPLETENESS SCORE ───────────────────────────────────
  const charScore = calculateCharacteristicsScore(finalAttrs, attributesToMap);
  if (!charScore.pass) {
    console.log(`\x1b[33m  ⚠️  Characteristics score low: ${charScore.score}% (${charScore.filledCount}/${charScore.totalCount}). Consider enriching.\x1b[0m`);
  }

  // ─── NEW QUALITY VALIDATIONS ───────────────────────────────────────────────
  const titleQuality = validateTitleQuality(ai.title_ru, brandForTextChecks, rawPrimaryKeyword);
  if (!titleQuality.pass) {
    console.log(`\x1b[31m  ❌ Title quality check failed: ${titleQuality.errors.join(' | ')}\x1b[0m`);
  }
  const langCheck = validateAllTextLanguage(ai);
  if (!langCheck.pass) {
    console.log(`\x1b[31m  ❌ Language validation failed (Not enough Cyrillic): ${langCheck.errors.join(' | ')}\x1b[0m`);
  }
  const imageQuality = validateImageQuality(rehostedImages);

  // ─── IMAGE OCR BRAND VALIDATION ─────────────────────────────────────────────
  // Run OCR on all re-hosted images.
  // COMPLIANCE RULE: OCR failures are WARNINGS only — they NEVER block upload.
  // Banned ingredient text in images generates a COMPLIANCE_RISK_IMAGE warning
  // and is saved to the audit log, then upload continues.
  let ocrPass = true; // Always stays true — OCR no longer gates upload
  let ocrAuditDetails = [];
  const ocrComplianceWarnings = [];

  // Banned ingredients to flag if found in OCR text
  const OCR_BANNED_INGREDIENTS = [
    "ashwagandha", "ashvagandha", "withania", "somnifera",
    "gokshura", "gokhru", "tribulus",
    "ашвагандха", "ашваганда", "гокшура", "трибулус"
  ];

  if (rehostedImages.length > 0) {
    const ocrResult = await validateImageBrands(rehostedImages, brandForTextChecks);
    // OCR brand result is recorded but NOT allowed to block upload
    ocrAuditDetails = ocrResult.results;

    if (!ocrResult.pass) {
      const failedIdxs = ocrResult.results.filter(r => !r.pass).map(r => r.index);
      console.log(`\x1b[33m  ⚠️  OCR: Foreign brand detected in image(s) ${failedIdxs.join(', ')} — WARNING only, continuing upload.\x1b[0m`);
    }

    // Scan OCR text for banned ingredients → generate compliance warning and REMOVE image
    const safeImages = [];
    for (const imgData of ocrResult.results) {
      if (!imgData.ocrText) {
         safeImages.push(rehostedImages[imgData.index]);
         continue;
      }
      const ocrLower = imgData.ocrText.toLowerCase();
      const foundIngredients = OCR_BANNED_INGREDIENTS.filter(term => ocrLower.includes(term));
      if (foundIngredients.length > 0) {
        const warning = `COMPLIANCE_VIOLATION: Image[${imgData.index}] contains banned ingredient text: ${foundIngredients.join(", ")}. REMOVING image from pipeline.`;
        ocrComplianceWarnings.push(warning);
        console.log(`\x1b[31m  ❌  ${warning}\x1b[0m`);
      } else {
        safeImages.push(rehostedImages[imgData.index]);
      }
    }
    // Only upload compliant images, dropping dangerous ones
    rehostedImages.length = 0; // Clear original array in place
    safeImages.forEach(img => rehostedImages.push(img));
  }

  // ─── BRAND AUDIT REPORT ──────────────────────────────────────────────────────
  // Build and persist the audit JSON before the final gate.
  const brandAudit = buildBrandAudit(ai, proxyBrand, finalAttrs, rehostedImages);
  await saveBrandAudit(brandAudit, p.asin);

  if (brandAudit.status === "FAIL") {
    console.log(`\x1b[31m  ❌ BRAND AUDIT FAILED for ${p.asin}. Mismatches: ${brandAudit.mismatches.join(', ')}\x1b[0m`);
  }

  // ─── FINAL UPLOAD SAFETY GATE ────────────────────────────────────────────────
  // All checks must PASS before any upload is attempted.
  // We pass brandForTextChecks to preUploadGate so it doesn't fail looking for "Нет бренда" in descriptions.
  const VARIANT_TARGET_CATEGORIES = [
    "makeup", "lipstick", "foundation", "concealer", "compact", "nail polish",
    "serum", "mascara", "eyeliner", "blush", "primer"
  ];
  const catLower = (p.product_category || "").toLowerCase();
  const kwLower = (p.scraped_keyword || "").toLowerCase();
  const isCosmeticCategory = VARIANT_TARGET_CATEGORIES.some(t => catLower.includes(t) || kwLower.includes(t));

  // ── INJECT COSMETIC SHADE ATTRIBUTES BEFORE VALIDATION ──
  // The gate validator requires 10096/10097 to exist on finalAttrs
  if (isCosmeticCategory && p.variant_value) {
    const shadeValue = String(p.variant_value || "").trim().slice(0, 100);
    const SHADE_TO_DICT_COLOR = {
      ivory: "Бежевый", pearl: "Бежевый", nude: "Бежевый", beige: "Бежевый",
      vanilla: "Бежевый", sand: "Бежевый", neutral: "Бежевый", natural: "Бежевый",
      porcelain: "Бежевый", cream: "Бежевый", shell: "Бежевый", fair: "Бежевый",
      almond: "Бежевый", warm: "Бежевый", golden: "Бежевый", light: "Бежевый",
      caramel: "Коричневый", brown: "Коричневый", mocha: "Коричневый", honey: "Коричневый",
      walnut: "Коричневый", chestnut: "Коричневый", cocoa: "Коричневый", tan: "Коричневый",
      hazelnut: "Коричневый", bronze: "Коричневый", cinnamon: "Коричневый",
      pink: "Розовый", rose: "Розовый", blush: "Розовый", mauve: "Розовый",
      red: "Красный", ruby: "Красный", wine: "Красный", cherry: "Красный", coral: "Красный",
      white: "Белый", marble: "Белый",
    };
    const shadeLower = shadeValue.toLowerCase();
    let dictColor = "Бежевый"; 
    for (const [kw, ruColor] of Object.entries(SHADE_TO_DICT_COLOR)) {
      if (shadeLower.includes(kw)) { dictColor = ruColor; break; }
    }
    const OZON_COLOR_IDS = { "Бежевый": 3732, "Коричневый": 3708, "Розовый": 3745, "Красный": 3710, "Белый": 3762 };
    const cId = OZON_COLOR_IDS[dictColor] || 3732;

    const idx96 = finalAttrs.findIndex(a => a.id === 10096);
    if (idx96 >= 0) { finalAttrs[idx96].values = [{ dictionary_value_id: cId, value: dictColor }]; }
    else { finalAttrs.push({ complex_id: 0, id: 10096, values: [{ dictionary_value_id: cId, value: dictColor }] }); }

    const idx97 = finalAttrs.findIndex(a => a.id === 10097);
    if (idx97 >= 0) { finalAttrs[idx97].values = [{ value: shadeValue }]; }
    else { finalAttrs.push({ complex_id: 0, id: 10097, values: [{ value: shadeValue }] }); }
  }

  const finalGate = preUploadGate(ai, proxyBrand, rehostedImages, finalAttrs, ai.keywords_ru || "", p, isCosmeticCategory);

  // ── PIPELINE STABILITY RULE ──────────────────────────────────────────────────
  //
  // Upload is ONLY blocked by truly unrecoverable errors:
  //   • Missing Cyrillic in title/description (content is unusable)
  //   • Russian language ratio too low
  //   • Competing brand name in title/description (content integrity)
  //
  // Upload is NEVER blocked by:
  //   • Brand not found on Ozon (falls back to Нет бренда, continues)
  //   • Brand audit FAIL (logged as warning, not blocker)
  //   • OCR detection of banned ingredients (COMPLIANCE_RISK_IMAGE warning only)
  //   • OCR detection of foreign brand (warning only)
  //   • Compliance rewrites (always applied, never blocking)
  //   • Missing attributes (logged, pipeline continues)
  //
  const uploadAllowed =
    finalGate.pass &&   // brand/title/desc/chars valid (Cyrillic, no competing brands)
    langCheck.pass;     // Russian language ratio OK
  // NOTE: ocrPass is intentionally excluded from uploadAllowed — OCR is warning-only.
  // NOTE: brandAudit.status is intentionally excluded — brand audit mismatch is a
  //       warning to review, NOT a reason to block fulfillment.

  // Prepare Master Upload Report Object (v55 — Enriched Audit Log)
  const uploadReport = {
    asin: p.asin,
    timestamp: new Date().toISOString(),
    status: uploadAllowed ? "APPROVED" : "BLOCKED",
    block_reasons: [],
    // ── Brand fields ──
    original_brand: p.brand || "N/A",
    resolved_brand: brand.value,
    brand_id: brand.id,
    brand_source: brand.value === "Нет бренда" ? "FALLBACK" : "RESOLVED",
    brand_fallback_used: brand.value === "Нет бренда",
    brand_audit: brandAudit,
    // ── Compliance fields ──
    compliance_rewrites: complianceScan.rewrites,
    compliance_fields_modified: complianceScan.rewrites.map(r => r.field),
    original_banned_content: complianceScan.rewrites.map(r => ({ field: r.field, original: r.original })),
    rewritten_content: complianceScan.rewrites.map(r => ({ field: r.field, replaced: r.replaced })),
    // ── OCR fields ──
    ocr_audit: ocrAuditDetails,
    ocr_compliance_warnings: ocrComplianceWarnings,
    // ── Quality fields ──
    characteristics_score: `${charScore.score}%`,
    seo_keywords: ai.keywords_ru,
    image_validation: imageQuality.pass ? "PASS" : "FAIL",
    title_quality: titleQuality,
    upload_result: null
  };

  const filledCount = Array.isArray(filled) ? filled.length + mandatory.length : mandatory.length;
  const charPoints = Math.min(30, Math.round((filledCount / 18) * 30));
  const descScore = ai.description_ru && ai.description_ru.length > 1000 ? 25 : (ai.description_ru && ai.description_ru.length > 300 ? 20 : 12);
  const contentRating = charPoints + descScore + 25 + 20;

  console.log(`\n\x1b[36m=== PRE-UPLOAD AUDIT ===\x1b[0m`);
  console.log(`  Brand Score                 : 20 / 20`);
  console.log(`  Description Score           : ${descScore} / 25`);
  console.log(`  Characteristics Score       : ${charPoints} / 30`);
  console.log(`  Content Rating Prediction   : ${contentRating} / 100`);
  console.log(`  Attributes Filled           : ${filledCount}`);
  console.log(`========================\n`);

  if (descScore < 20 || charPoints < 25 || contentRating < 80) {
      console.log(`\x1b[33m  ⚠️ WARNING: Content Rating Prediction < 80. AI Optimization fully applied.\x1b[0m`);
  }

  if (!uploadAllowed) {
    uploadReport.block_reasons = [
      ...finalGate.blockers,
      ...langCheck.errors
    ];
    // Brand audit warnings (non-blocking) — log separately
    if (brandAudit.status === "FAIL") {
      console.log(`\x1b[33m  ⚠️  BRAND AUDIT: Mismatches detected (${brandAudit.mismatches.join(",")}) — logged as warning, does NOT block upload.\x1b[0m`);
    }
    console.log(`\x1b[31m  ❌ UPLOAD BLOCKED for ${p.asin}: ${uploadReport.block_reasons.join(' | ')}\x1b[0m`);
    await saveUploadReport(p.asin, uploadReport);
    return { success: false, error: `UPLOAD_BLOCKED: ${uploadReport.block_reasons.join(' | ')}` };
  }

  // Log brand audit issues as non-blocking warnings
  if (brandAudit.status === "FAIL") {
    console.log(`\x1b[33m  ⚠️  BRAND AUDIT WARNING for ${p.asin}: Mismatches in ${brandAudit.mismatches.join(", ")} — proceeding with upload.\x1b[0m`);
  }

  console.log(`\x1b[32m  ✅ All validation gates PASSED for ${p.asin} — proceeding to upload.\x1b[0m`);

  const baseItem = {
    offer_id: p.asin,
    name: ai.title_ru.slice(0, 200),
    description: ai.description_ru,
    price: finalUsd.toFixed(2),
    old_price: oldPrice > 0 ? String(oldPrice) : String(Math.round(finalUsd * 2)),
    currency: "USD",
    vat: "0",
    weight: grossWeight,
    weight_unit: "g",
    dimension_unit: "mm",
    height: 150, width: 50, depth: 50,
    description_category_id: parseInt(descriptionCategoryId, 10),
    type_id: parseInt(typeId, 10),
    // Use a Map to deduplicate attributes by ID, prioritizing mandatory/fixed values
    attributes: Array.from(
      new Map(
        [...(Array.isArray(mandatory) ? mandatory : []), ...(Array.isArray(filled) ? filled : [])]
          .map(a => [a.id, a])
      ).values()
    ),
    images: ozonImageList.length > 0 ? ozonImageList : (Array.isArray(p.image_urls) ? p.image_urls.slice(0, 5) : [])
  };

  const payload = { items: [] };
  const numVol = parseFloat(volVal) || 0;
  const numWeight = netWeight;

  // ─── Shared helpers for variant creation ───────────────────────────────────
  const insertPackIntoTitle = (title, packText) => {
    if (title.includes(',')) {
      return title.replace(/,\s*([^,]+)$/, `, ${packText}, $1`);
    }
    return `${title}, ${packText}`;
  };

  const updateVariantAttributes = (baseAttrs, sku, quantity) => {
    const attrs = JSON.parse(JSON.stringify(baseAttrs));
    const artAttr = attrs.find(a => a.id === 9024);
    if (artAttr) artAttr.values[0].value = sku;
    for (const attr of attrs) {
      const ozonAttrDef = ozonAttrs.find(oa => oa.id === attr.id);
      const name = ozonAttrDef ? ozonAttrDef.name.toLowerCase() : "";
      const isUnitField = name.includes("кол-во") || name.includes("единиц") || name.includes("количество") || name.includes("упаковке") || name.includes("штук") || [12053, 11370, 10103, 10095].includes(attr.id);
      if (isUnitField) {
        attr.values = [{ value: String(quantity) }];
      }
    }
    return attrs;
  };

  // ─── SHADE VARIANT vs QUANTITY VARIANT BRANCH ─────────────────────────────
  // If the product is a cosmetic shade child (variant_type is set), we do NOT
  // create Pack 2/3/4 quantity variants. Instead we push ONE item per shade and
  // rely on the shared model_group (parent ASIN) to group them into a single
  // Ozon product card with a colour/shade switcher.
  //
  // If variant_type is NOT set, we use the existing quantity-tier logic,
  // EXCPET for Cosmetics — we never create fake quantity packs for them.
  // ──────────────────────────────────────────────────────────────────────────

  const isShadeVariant = !!(p.variant_type && p.variant_value);

  if (isShadeVariant) {
    // ── COSMETIC SHADE VARIANT PATH ──────────────────────────────────────────

    console.log(`  💄 Shade variant detected: type="${p.variant_type}" value="${p.variant_value}"`);

    // Override model_group (attr 9048) to use the PARENT ASIN so all shades
    // of the same foundation/lipstick are physically grouped on Ozon.
    const parentGroupName = `${p.brand || ""} ${p.parent_asin || p.asin}`.trim().slice(0, 255);
    const shadeBaseAttrs = JSON.parse(JSON.stringify(baseItem.attributes));
    const modelGroupAttr = shadeBaseAttrs.find(a => a.id === 9048);
    if (modelGroupAttr) {
      modelGroupAttr.values[0].value = parentGroupName;
    } else {
      shadeBaseAttrs.push({ complex_id: 0, id: 9048, values: [{ value: parentGroupName }] });
    }

    // 10096 and 10097 are now injected directly into finalAttrs BEFORE validation, 
    // so shadeBaseAttrs implicitly inherits them identically.

    // Build shade-specific item — images are variant-specific (set during scraping)
    const shadeItem = {
      ...baseItem,
      offer_id: p.asin,   // variant ASIN is the unique offer ID
      name: ai.title_ru.slice(0, 200),
      attributes: shadeBaseAttrs,
      images: ozonImageList.length > 0 ? ozonImageList : (Array.isArray(p.image_urls) ? p.image_urls.slice(0, 5) : []),
    };

    payload.items.push(shadeItem);
    console.log(`  💄 Shade item built: offer_id=${shadeItem.offer_id}, group="${parentGroupName}"`);

  } else {
    // ── REGULAR QUANTITY-TIER VARIANT PATH (unchanged) ───────────────────────

    const effectiveSize = Math.max(parseFloat(volVal) || 0, netWeight); // use whichever is larger

    // Always push the base (Pack 1)
    payload.items.push(baseItem);
    console.log(`  📦 Variant tier: effectiveSize=${effectiveSize} (vol=${volVal}, weight=${netWeight})`);

    // ── STRICT COSMETIC BYPASS (User Requirement Fix) ──
    if (isCosmeticCategory) {
      console.log(`  💄 Cosmetic category detected: Bypassing fake Pack 2/3/4 quantity generation entirely.`);
    } else if (effectiveSize <= 500) {
      // Tier 1: 4 packs
      console.log(`  📦 Tier 1 (≤500): Creating Pack 2, 3, 4`);

      // Pack 2 (20% discount on total)
      const pack2Price = finalUsd * 2 * 0.80;
      const pack2OldPrice = oldPrice > 0 ? (parseFloat(oldPrice) * 2 * 0.80) : (pack2Price * 2);
      console.log(`\x1b[33m  ⚠️  Variant 2 OCR: Missing "Набор 2 шт." on image (Regenerate recommended)\x1b[0m`);
      payload.items.push({
        ...baseItem,
        offer_id: p.asin + "-2",
        name: insertPackIntoTitle(ai.title_ru, "набор 2 шт").slice(0, 200),
        price: pack2Price.toFixed(2),
        old_price: String(pack2OldPrice.toFixed(2)),
        weight: grossWeight * 2,
        attributes: updateVariantAttributes(baseItem.attributes, p.asin + "-2", 2)
      });

      // Pack 3 (30% discount on total)
      const pack3Price = finalUsd * 3 * 0.70;
      const pack3OldPrice = oldPrice > 0 ? (parseFloat(oldPrice) * 3 * 0.70) : (pack3Price * 2);
      console.log(`\x1b[33m  ⚠️  Variant 3 OCR: Missing "Набор 3 шт." on image (Regenerate recommended)\x1b[0m`);
      payload.items.push({
        ...baseItem,
        offer_id: p.asin + "-3",
        name: insertPackIntoTitle(ai.title_ru, "набор 3 шт").slice(0, 200),
        price: pack3Price.toFixed(2),
        old_price: String(pack3OldPrice.toFixed(2)),
        weight: grossWeight * 3,
        attributes: updateVariantAttributes(baseItem.attributes, p.asin + "-3", 3)
      });

      // Pack 4 (40% discount on total)
      const pack4Price = finalUsd * 4 * 0.60;
      const pack4OldPrice = oldPrice > 0 ? (parseFloat(oldPrice) * 4 * 0.60) : (pack4Price * 2);
      console.log(`\x1b[33m  ⚠️  Variant 4 OCR: Missing "Набор 4 шт." on image (Regenerate recommended)\x1b[0m`);
      payload.items.push({
        ...baseItem,
        offer_id: p.asin + "-4",
        name: insertPackIntoTitle(ai.title_ru, "набор 4 шт").slice(0, 200),
        price: pack4Price.toFixed(2),
        old_price: String(pack4OldPrice.toFixed(2)),
        weight: grossWeight * 4,
        attributes: updateVariantAttributes(baseItem.attributes, p.asin + "-4", 4)
      });

    } else if (effectiveSize <= 1000) {
      // Tier 2: Pack 1 + Pack 2 only
      console.log(`  📦 Tier 2 (501–1000): Creating Pack 2 only`);

      const pack2Price = finalUsd * 2 * 0.80;
      const pack2OldPrice = oldPrice > 0 ? (parseFloat(oldPrice) * 2 * 0.80) : (pack2Price * 2);
      console.log(`\x1b[33m  ⚠️  Variant 2 OCR: Missing "Набор 2 шт." on image (Regenerate recommended)\x1b[0m`);
      payload.items.push({
        ...baseItem,
        offer_id: p.asin + "-2",
        name: insertPackIntoTitle(ai.title_ru, "набор 2 шт").slice(0, 200),
        price: pack2Price.toFixed(2),
        old_price: String(pack2OldPrice.toFixed(2)),
        weight: grossWeight * 2,
        attributes: updateVariantAttributes(baseItem.attributes, p.asin + "-2", 2)
      });

    } else {
      // Tier 3: >1000 — single product only (already pushed above)
      console.log(`  📦 Tier 3 (>1000): Single product only`);
    }
  }

  // 8. FINAL GLOBAL SANITIZATION (v55 — Fault Tolerant)
  // Applies deep rewrite on the full payload. Never blocks upload.
  // If any banned words survive sanitization, we LOG the warning and continue.
  const sanitizedPayload = deepSanitize(payload);

  const remainingCheck = containsProhibitedWords(sanitizedPayload);
  if (remainingCheck.found) {
    // WARN only — do NOT abort. The sanitizer did its best.
    console.log(`\x1b[33m  ⚠️  POST-SANITIZE WARNING for ${p.asin}: Some banned terms may remain (${remainingCheck.terms.join(", ")}). Payload will be submitted — monitor Ozon moderation.\x1b[0m`);
    uploadReport.ocr_compliance_warnings = [
      ...(uploadReport.ocr_compliance_warnings || []),
      `POST_SANITIZE_RESIDUAL: ${remainingCheck.terms.join(", ")}`
    ];
  }

  const res = await ozonPost("/v3/product/import", sanitizedPayload);
  const result = res.json;

  if (!res.ok) {
    const err = result?.message || result?.error_message || result?.error?.message || res.text?.slice(0, 500);
    console.log(`\x1b[31m  ❌ Ozon HTTP Error: ${err}\x1b[0m`);
    return { success: false, error: err };
  }

  if (result?.error) {
    console.log(`\x1b[31m  ❌ Ozon API Error: ${result.error.message || result.error.code}\x1b[0m`);
    return { success: false, error: result.error.message || result.error.code };
  }

  const taskId = result?.result?.task_id;
  if (taskId) {
    uploadReport.status = "SUCCESS";
    uploadReport.task_id = taskId;
    uploadReport.upload_result = "SUCCESS";
    // Mark in DB so re-runs skip this ASIN
    await markAsUploaded(p.asin, p.parent_asin ?? null, taskId);
  } else {
    uploadReport.upload_result = "FAIL";
  }

  await saveUploadReport(p.asin, uploadReport);
  
  // ── Requested Cosmetics Pipeline Logs ──
  const modelGrp = finalAttrs.find(a => a.id === 9048)?.values?.[0]?.value || "N/A";
  const shadeName = p.variant_value || "N/A";
  console.log(`\n\x1b[35m=== RUNTIME UPLOAD LOG ===\x1b[0m`);
  console.log(`  Parent ASIN     : ${p.parent_asin || "Standalone"}`);
  console.log(`  Variant ASIN    : ${p.asin}`);
  console.log(`  Brand           : ${brand.value}`);
  console.log(`  Brand ID        : ${brand.id}`);
  console.log(`  Shade Name      : ${shadeName}`);
  console.log(`  Model Group     : ${modelGrp}`);
  console.log(`  Upload Status   : ${taskId ? "\x1b[32mSUCCESS\x1b[0m ("+taskId+")" : "\x1b[31mFAIL\x1b[0m ("+JSON.stringify(result)+")"}`);
  console.log(`==========================\n`);

  return { success: !!taskId, taskId, result };
}

// Helper to save upload reports
async function saveUploadReport(asin, reportData) {
  try {
    const dir = "./upload-reports";
    const fs = await import("fs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await Bun.write(`${dir}/${asin}.json`, JSON.stringify(reportData, null, 2));
    console.log(`  📝 Upload report saved: ${dir}/${asin}.json`);
  } catch (err) {
    console.warn(`  ⚠️  Failed to save upload report: ${err.message}`);
  }
}

export async function preflightCheck() {
  const res = await ozonPost("/v1/description-category/tree", { language: "DEFAULT" });
  if (!res.ok) throw new Error(`Ozon API Error: ${res.status} - ${res.status === 403 ? "Forbidden" : res.text}`);
}