#!/usr/bin/env bun

/**
 * M6 — EN → RU translation + AI content generation (HARDENED & SEO OPTIMIZED)
 *
 * Primary AI: Groq (llama-3.1-8b-instant)
 */

import path from "path";
import { extractComposition } from "./m10b-attr-mapper.js";
import { callOllama } from "./ollama-client.js";

const CACHE_FILE  = path.join(process.cwd(), "translate-cache.json");

// ─── AI Config (Groq primary) ─────────────────────────────────────────────────
const GROQ_API_KEY  = Bun.env.GROQ_API_KEY;
const GROQ_MODEL    = "llama-3.1-8b-instant";

// ─── Cache ────────────────────────────────────────────────────────────────────

let memCache = null;

async function loadCache() {
  if (memCache) return memCache;
  const file = Bun.file(CACHE_FILE);
  if (!(await file.exists())) { memCache = new Map(); return memCache; }
  try { memCache = new Map(Object.entries(await file.json())); return memCache; } catch { memCache = new Map(); return memCache; }
}

async function saveCache(cache) {
  memCache = cache;
  try { await Bun.write(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2)); } catch (err) {}
}

// ─── Cleaners ─────────────────────────────────────────────────────────────────

function cleanForOzon(text) {
  if (!text) return "";
  let t = text
    .replace(/<[^>]*>?/gm, "") // Strip HTML
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Strip control chars
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s,.%\-]/g, " ") // STRIP EVERYTHING ELSE (v43 Hardened)
    .replace(/\s+/g, " ")
    .trim();

  return sanitizeProhibitedWords(t);
}

/**
 * STRICT TITLE CLEANER (v56 — Ozon Error Proof)
 * Removes all corruption patterns that trigger Ozon moderation errors:
 *  "The title contains many special characters"
 *  "The title contains nonsensical text or grammatical errors"
 */
function strictTitleClean(title) {
  if (!title) return "";
  let t = title;

  // 0. ASIN / SKU / Barcode / Shipment-ID cleanup
  t = t.replace(/\bB0[A-Z0-9]{8}\b/g, "");                // Amazon ASIN (B0XXXXXXXX)
  t = t.replace(/\b\d{10,13}\b/g, "");                    // EAN / barcode (10–13 digits)
  t = t.replace(/(?<!\d)\d{6,9}(?!\d)/g, "");             // SKU fragments (6–9 digits)
  t = t.replace(/\b[A-Z]{1,3}[0-9]{6,10}\b/g, "");       // FNSKU / SellerSKU
  t = t.replace(/\(\s*(ASIN|SKU|UPC|EAN|FNSKU|barcode)\s*[:\-]?\s*[\w\-]{6,}\s*\)/gi, "");
  t = t.replace(/\bFBA[A-Z0-9]{8,14}\b/gi, "");           // FBA shipment codes

  // 1. Strip leading numbered list fragments: "1. ", "2. , ,", "1)", etc.
  t = t.replace(/^\s*\d+[\.)\-]\s*/g, "");

  // 2. Remove ANY occurrence of " N. " or " N) " midstring (numbered bullets)
  t = t.replace(/\s+\d+[\.)\-]\s+/g, " ");

  // 3. Collapse repeated punctuation: ---, ..., ,,,, . . . etc.
  t = t.replace(/(\.\s*){2,}/g, ". "); // . . . -> .
  t = t.replace(/(-\s*){2,}/g, "-");   // --- -> -
  t = t.replace(/(,\s*){2,}/g, ", ");   // ,,, -> ,
  t = t.replace(/;{2,}/g, ";");

  // 4. Remove standalone punctuation tokens (e.g. " - " isolated, " , " isolated after strip)
  t = t.replace(/(^|\s)[,;.\-]+(?=\s|$)/g, " ");

  // 5. Remove repeated single-char sequences separated by spaces (e.g. "а а а", ", , ,")
  t = t.replace(/(\b.\b\s){3,}/g, " ");

  // 6. Remove lines/fragments that are only punctuation + digits (OCR garbage)
  t = t.replace(/^[^а-яА-ЯёЁa-zA-Z]+$/, "");

  // 7. Normalize spacing around punctuation
  t = t.replace(/\s+,/g, ",");
  t = t.replace(/,([^\s])/g, ", $1");
  t = t.replace(/\s+/g, " ").trim();

  // 8. Strip leading/trailing punctuation/digits that have no word context
  t = t.replace(/^[\s,;.\-\d]+/, "").replace(/[\s,;.\-]+$/, "");

  return t.trim();
}

/**
 * STRICT OZON SANITIZATION (BANNED WORDS)
 * Removes Ashwagandha, Withania somnifera and other restricted terms.
 */
export function sanitizeProhibitedWords(text) {
  if (!text) return "";
  let t = text;
  
  // BANNED -> SAFE REPLACEMENT (v44 - Hardened)
  const banned = [
    { regex: /ashwagandha/gi, safe: "herbal supplement" },
    { regex: /ashvagandha/gi, safe: "wellness formula" },
    { regex: /withania\s+somnifera/gi, safe: "herbal blend" },
    { regex: /withania/gi, safe: "plant extract" },
    { regex: /somnifera/gi, safe: "plant-based formula" },
    { regex: /gokshura/gi, safe: "men's health supplement" },
    { regex: /tribulus\s+terrestris/gi, safe: "botanical extract" },
    { regex: /tribulus/gi, safe: "botanical extract" },
    { regex: /ашвагандха/gi, safe: "растительный экстракт" },
    { regex: /ашваганда/gi, safe: "аюрведический сбор" },
    { regex: /витания/gi, safe: "травяной сбор" },
    { regex: /сомнифера/gi, safe: "растительная добавка" },
    { regex: /гокшура/gi, safe: "мужская формула" },
    { regex: /трибулус/gi, safe: "травяная добавка" },
    { regex: /террестрис/gi, safe: "растительный экстракт" }
  ];

  for (const item of banned) {
    t = t.replace(item.regex, item.safe);
  }
  return t;
}

/**
 * FINAL POLISH: Fixes common AI mistranslations and grammatical errors.
 * Ensures titles like "борьба перхотью" become "против перхоти".
 */
function finalPolish(text) {
  if (!text) return "";
  let t = text;

  // 1. Fix common Ayurvedic/Botanical mistranslations
  const dict = {
    "айверведическое": "аюрведическое",
    "айверведа": "аюрведа",
    "неем": "ним",
    "нима": "ним",
    "брихраг": "брингарадж",
    "брингхарадж": "брингарадж",
    "брингхарадж": "брингарадж",
    "бриградж": "брингарадж",
    "брахми": "брами",
    "ритха": "ритха",
    "реттха": "ритха",
    "нетто-жирное": "нежирное",
    "нетто жирное": "нежирное",
    "борьба перхотью": "против перхоти",
    "борьба с перхотью": "против перхоти",
    "борьба выпадением": "против выпадения",
    "борьба с выпадением": "против выпадения",
    "укреплением": "укрепляющее",
    "увлажнением": "увлажняющее",
    "питанием": "питательное",
    "нетто-вес": "",
    "нетто вес": "",
    "не жирное": "нежирное",
    "шаховница": "",
    "порошок самбара": "самбар порошок",
    "масала самбара": "самбар масала",
    "средство для умывания": "гель для умывания",
    "очищающее средство для лица": "гель для умывания",
    "масло амлы": "масло с амлой",
    "фундамент для лица": "тональный крем",
    "фундамент": "тональный крем",
    "фондация": "тональный крем",
    "крем-фондшен": "тональный крем",
    "lakm": "",
    "нет бренда": ""
  };

  for (const [bad, good] of Object.entries(dict)) {
    // Escape regex characters just in case, but keep simple boundary matching
    const safeBad = bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${safeBad}\\b`, "gi");
    t = t.replace(regex, good);
  }

  // 2. Specific fixes for the user's reported error
  t = t.replace(/масло для волос с ним/gi, "масло для волос с нимом");
  t = t.replace(/с брингарадж/gi, "с брингараджем");
  t = t.replace(/борьба против/gi, "против");
  t = t.replace(/борьбы с/gi, "против");
  t = t.replace(/борьба с/gi, "против");
  t = t.replace(/нетто-жирное сухой кожи головы/gi, "нежирное для сухой кожи головы");
  t = t.replace(/для прыщей/gi, "против прыщей");
  t = t.replace(/против акне прыщей/gi, "против акне и прыщей");
  t = t.replace(/завтраковый хлопья/gi, "сухой завтрак");
  t = t.replace(/завтраковые хлопья/gi, "сухой завтрак");
  t = t.replace(/порошок самбар/gi, "приправа самбар");
  t = t.replace(/с индийскими специями/gi, "со специями");
  t = t.replace(/для акне/gi, "против акне");
  t = t.replace(/с амла/gi, "с амлой");
  t = t.replace(/пакет из (\d+)/gi, "набор $1 шт");
  t = t.replace(/упаковка из (\d+)/gi, "набор $1 шт");
  t = t.replace(/для мужчин и женщин/gi, "унисекс");
  t = t.replace(/порошок куркумы/gi, "куркума молотая");
  t = t.replace(/таблетки - (\d+)/gi, "$1 таблеток");
  t = t.replace(/капсулы - (\d+)/gi, "$1 капсул");

  // 3. Remove weird punctuation (extended)
  t = t.replace(/,\s*,/g, ",");
  t = t.replace(/(\.\s*){2,}/g, ". ");
  t = t.replace(/(-\s*){2,}/g, "-");
  t = t.replace(/(,\s*){2,}/g, ", ");
  t = t.replace(/\s+/g, ' ').trim();

  return sanitizeProhibitedWords(t);
}

// ─── Fast Groq Translation (Batch) ──────────────────────────────────────────

async function aiTranslateBatch(strings) {
  const systemPrompt = `You are a professional EN to RU translator. Translate the given list of skincare phrases into natural Russian.
- Return ONLY a JSON object with "translations" key.
- Maintain a professional, neutral tone. MUST strictly remove promotional words like "Best", "No.1", "Top", "100% guarantee", "Instant result", "Sale", "Offer", "Free". Keep only neutral product facts.
- Schema: {"translations": ["ru_1", "ru_2", ...]}`;

  const userPrompt = `Translate these ${strings.length} items to skincare Russian:
${JSON.stringify(strings)}`;

  if (GROQ_API_KEY) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });
      if (response.ok) {
        const data = await response.json();
        const ru = JSON.parse(data.choices[0].message.content).translations;
        if (Array.isArray(ru) && ru.length === strings.length) return ru.map(cleanForOzon);
      }
    } catch {}
  }
  return null;
}

// ─── Legacy Google translate fallback ─────────────────────────────────────────

async function googleTranslateString(text, attempts = 3) {
  try {
    const url = new URL("https://clients5.google.com/translate_a/t");
    url.searchParams.set("client", "dict-chrome-ex");
    url.searchParams.set("sl", "en");
    url.searchParams.set("tl", "ru");
    url.searchParams.set("q", text);

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://chrome.google.com/" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const t = Array.isArray(data) ? data[0] : text;
    return cleanForOzon(t);
  } catch (err) {
    if (attempts > 1) { await new Promise(r => setTimeout(r, 1000)); return googleTranslateString(text, attempts - 1); }
    return cleanForOzon(text);
  }
}

// ─── Batch translate ─────────────────────────────────────────────────────────

export async function translateStrings(strings) {
  if (!strings.length) return [];
  const cache = await loadCache();
  const resultsMap = new Map();
  const misses = [];

  strings.forEach(s => {
    if (cache.has(s)) resultsMap.set(s, cache.get(s));
    else misses.push(s);
  });

  const uniqueMisses = [...new Set(misses)];
  if (uniqueMisses.length > 0) {
    for (let i = 0; i < uniqueMisses.length; i += 15) {
      const chunk = uniqueMisses.slice(i, i + 15);
      const translated = await aiTranslateBatch(chunk);
      if (translated) {
        chunk.forEach((orig, idx) => { cache.set(orig, translated[idx]); resultsMap.set(orig, translated[idx]); });
      } else {
        for (const s of chunk) {
          const t = await googleTranslateString(s);
          cache.set(s, t);
          resultsMap.set(s, t);
        }
      }
    }
    await saveCache(cache);
  }

  return strings.map(s => resultsMap.get(s) ?? s);
}

// ─── Groq Core Helper ─────────────────────────────────────────────────────────

async function callAI(systemPrompt, userPrompt) {
  // 1. Try Groq API first (Paid/High Quality) - 3 attempts with backoff
  if (GROQ_API_KEY) {
    console.log("  🤖 Attempting Groq API (llama-3.1-8b-instant)...");
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            temperature: 0.3, max_tokens: 3000
          }),
          signal: AbortSignal.timeout(45_000)
        });

        if (response.status === 429 && attempt < 3) {
          console.warn(`  ⏳ [m6] Groq 429 rate-limit. Sleeping 60s before retry...`);
          await new Promise(r => setTimeout(r, 60_000));
          continue;
        }

        if (response.ok) {
          const data = await response.json();
          let content = data.choices[0].message.content?.trim() || "";
          content = content.replace(/^(Sure|Here|Russian|Translation|Title|Product|Ozon|Generated|Below|Result).*?:\s*/i, '');
          content = content.replace(/^["']|["']$/g, '');
          return cleanForOzon(content);
        }
        break;
      } catch (err) {
        console.warn(`  ⚠️ [m6] Groq connection error (Attempt ${attempt}/3): ${err.message}`);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 3000));
          continue;
        }
      }
    }
  }

  // 2. Fallback to Local Ollama
  console.log("  🤖 Groq unavailable or failed. Attempting Local AI (Ollama)...");
  const localResult = await callOllama(systemPrompt, userPrompt);
  if (localResult) return cleanForOzon(localResult);

  // 3. Both AI backends failed — return empty, callers handle template fallback
  console.warn("  ⚠️ [m6] All AI backends failed. Will use template fallback.");
  return "";
}

// ─── Template Fallback (no AI needed) ────────────────────────────────────────
// Called when both Groq and Ollama are unavailable. Builds a structured
// Ozon-compliant Russian title/annotation purely from product data fields.

const PRODUCT_TYPE_MAP = {
  "shampoo": "Шампунь", "conditioner": "Кондиционер", "serum": "Сыворотка",
  "oil": "Масло", "hair oil": "Масло для волос", "face wash": "Гель для умывания",
  "cream": "Крем", "lotion": "Лосьон", "gel": "Гель", "mask": "Маска",
  "toner": "Тоник", "scrub": "Скраб", "moisturizer": "Увлажняющее средство",
  "sunscreen": "Солнцезащитный крем", "spf": "Солнцезащитный крем",
  "hair mask": "Маска для волос", "hair serum": "Сыворотка для волос",
  "face cream": "Крем для лица", "body lotion": "Лосьон для тела",
  "body wash": "Гель для душа", "soap": "Мыло",
  "spices": "Специи", "masala": "Масала", "spice": "Специя", "powder": "Порошок",
  "paste": "Паста", "sauce": "Соус", "pickle": "Маринад", "honey": "Мед",
  "face scrub": "Скраб для лица", "body scrub": "Скраб для тела",
  "coffee beans": "Кофе в зернах", "instant coffee": "Растворимый кофе",
  "ground coffee": "Молотый кофе", "coffee": "Кофе", "tea": "Чай",
  "seeds": "Семена", "seed": "Семена", "nuts": "Орехи", "nut": "Орехи", "dry fruits": "Сухофрукты"
};

function buildTemplateFallback(product) {
  const name = (product.name || "").toLowerCase();
  const brand = String(product.brand || "").trim();

  // Detect product type from name
  let productType = "Косметическое средство";
  for (const [en, ru] of Object.entries(PRODUCT_TYPE_MAP)) {
    if (name.includes(en)) { productType = ru; break; }
  }

  // Get first ingredient (up to 2 words)
  const ingredientRaw = (product.ingredients || "").split(/[,;]/)[0].trim().slice(0, 40);

  // Get size
  const sizeMatch = (product.name || "").match(/(\d+)\s*(ml|мл|g|г|oz)/i);
  const size = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toLowerCase().replace('g','г').replace('ml','мл')}` : (product.net_quantity || "");

  // Build title: Type + Brand + [Ingredient], [Size]
  const title = `${productType} ${brand}${ingredientRaw ? ` с ${ingredientRaw.toLowerCase()}` : ''}, ${size || 'для всех типов'}`;


  // Build annotation
  const bullets = Array.isArray(product.feature_bullets) ? product.feature_bullets.slice(0, 2) : [];
  const annotation = `${brand} предлагает ${productType.toLowerCase()} на основе натуральных компонентов.` +
    (bullets.length > 0 ? ` Средство ${bullets[0].toLowerCase().slice(0, 100)}.` : '') +
    ` Подходит для регулярного использования.`;

  return { title: title.slice(0, 150), annotation: annotation.slice(0, 600) };
}

// ─── Content Generators ───────────────────────────────────────────────────────

// ULTIMATE DEDUPLICATOR (v13) - Strict Repetition & Synonym Shield
function deduplicateTitle(title) {
  const clean = title.replace(/[«»"“”'!|]/g, ' '); 
  const words = clean.split(/\s+/).filter(Boolean);
  const seenStems = new Set();
  const seenGlue = new Set();
  const result = [];
  
  const glueWords = new Set(['для', 'и', 'с', 'от', 'в', 'на', 'без', 'при', 'к', 'по']);
  
  // Collapse well-known synonyms to a single stem to prevent double-dipping
  const getStem = (w) => {
    let lower = w.toLowerCase().trim();
    if (lower.startsWith('сыворот') || lower.startsWith('серум')) return 'serum';
    if (lower.startsWith('шампун') || lower.startsWith('shampoo')) return 'shamp';
    if (lower.startsWith('кондиционер') || lower.startsWith('бальзам') || lower.startsWith('ополаскиватель')) return 'condi';
    if (lower.startsWith('маск') || lower.startsWith('mask')) return 'maska';
    if (lower.startsWith('масло') || lower.startsWith('масла') || lower.startsWith('oil')) return 'maslo';
    if (lower.startsWith('рост') || lower.startsWith('роста')) return 'rost';
    return lower.slice(0, 5);
  };
  
  for (let word of words) {
    const lower = word.toLowerCase().trim();
    if (lower.length < 3) {
      result.push(word);
      continue;
    }
    
    if (glueWords.has(lower)) {
        if (seenGlue.has(lower)) continue;
        seenGlue.add(lower);
    } else {
        const stem = getStem(lower);
        if (seenStems.has(stem)) continue;
        seenStems.add(stem);
    }
    result.push(word);
  }
  return result.join(' ').replace(/\s+/g, ' ').trim();
}

async function generateSeoTitle(product, cache, typeLabel = "") {
  const cacheKey = `seo_v30_${product.asin}`; // bump version to force regen
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const systemPrompt = `You are a Strict E-commerce Translator and Ozon SEO Expert.
  Your goal is to CLEAN and TRANSLATE the original Amazon product title into an Ozon-compliant Russian title.

  STRICT FORMAT REQUIRED (ONE CLEAN SENTENCE, EXACT STRUCTURE):
  Brand (English) + Product Type (Russian) + Key Ingredient / Variant / Shade (Russian) + Main Property / Usage (Russian) + Weight / Volume / Quantity

  CRITICAL RULES — FAILURE TO FOLLOW = INVALID OUTPUT:
  1. EXACT START: The title MUST start directly with the Brand (English) followed by the Product Type (Russian) (e.g. "Maybelline New York тональный крем для лица матовый"). Do NOT put adjectives at the very beginning.
  2. FORMAT STRICTNESS: Return ONLY one clean sentence. No lists. No bullets. No numbered points.
  3. FORBIDDEN PATTERNS (NEVER include any of these):
      - Numbered fragments: "1.", "2.", "1)", "2)"
      - Repeated commas: ",,", ",  ,"
      - Repeated dashes: "---", "--"
      - Repeated dots: "...", ". . ."
      - Symbols: "|", "#", "*", "•", "●", "—", "–" (except hyphens within words)
      - The phrase "Нет бренда" or "No Brand" or "Без бренда"
  3. NO HALLUCINATIONS: Use ONLY facts from the Amazon title. Never invent ingredients.
  4. LANGUAGE: Russian Cyrillic EXCEPT for the Brand name AND cosmetic Shade/Variant names (e.g., "Vanilla", "Light Pecan" should stay in English).
  5. GRAMMAR: Perfect Russian grammar. Natural, fluent phrasing. For cosmetics, append the shade nicely, e.g. "оттенок Vanilla". NEVER use "оттенок" for pack quantities (like "Pack of X")—translate packs as "X шт." or "упаковка X шт.".
  6. EXTREME BAN ON REPETITION: NEVER repeat words, and NEVER use synonyms together. DO NOT repeat the brand name. Keep it DENSE, SHORT, and CLEAN.
  7. LENGTH: Target 120–180 characters. Minimum: 90. Maximum: 200.
  8. NO PROMOTIONAL WORDS / SPAM: (100% Original, Best Seller, Premium Quality, Top Quality, No.1, Best Price, Store Name, Seller Name, Phone Numbers, URLs)
  9. PROHIBITED WORDS: NEVER use "Ashwagandha", "Gokshura", "Withania somnifera", "Tribulus Terrestris" — use "растительный экстракт" or "травяной сбор".
  10. NO HASHTAGS: Do NOT include hashtags.
${typeLabel ? `  11. CATEGORY LOCK: You MUST use the exact product category term "${typeLabel}" in the title. For example, if it is "Сыворотка", NEVER output "Крем".` : ''}

  CORRECT EXAMPLES:
  - Amazon: "Aachi Sambar Powder Masala 200g | South Indian Spice Mix"
    ✅ Ozon: "Aachi самбар масала, смесь специй для южно-индийских блюд, 200 г"
  - Amazon: "Himalaya Neem Face Wash for Acne & Pimples 100ml"
    ✅ Ozon: "Himalaya гель для умывания с нимом против акне, 100 мл"
  - Amazon: "Garnier Bright Complete Vitamin C Serum 30ml"
    ✅ Ozon: "Garnier сыворотка с витамином C для сияния кожи, 30 мл"
  - Amazon: "LAKMÉ 9 to 5 Primer + Matte Foundation, Minimalist Shell 27ml"
    ✅ Ozon: "Lakme 9 to 5 Primer + Matte Foundation, тональный крем с матовым финишем, 27 мл, оттенок Shell"

  RETURN ONLY the final title string. Nothing else.`;

  const userPrompt = `ORIGINAL AMAZON TITLE: ${product.name}
ADDITIONAL CONTEXT (ONLY use this if the title is too vague):
SIZE: ${product.net_quantity || product.weight_grams + 'g' || 'N/A'}`;

  let aiContent = await callAI(systemPrompt, userPrompt);

  // ─── STEP 1: Strip raw AI preambles before anything else ───
  if (aiContent) {
    aiContent = aiContent.replace(/^(Sure|Here|Russian|Translation|Title|Product|Ozon|Generated|Below|Result|Вот|Название|Ответ|OK|Okay).*?[:\n]/i, "");
    aiContent = aiContent.replace(/^["'\s]+|["'\s]+$/g, ""); // strip surrounding quotes
  }

  // ─── STEP 2: Apply strict title cleaner immediately after AI ───
  aiContent = strictTitleClean(aiContent || "");
  aiContent = cleanForOzon(aiContent).trim();

  // ─── TEMPLATE FALLBACK: if AI returned nothing or junk, build from data ───
  if (!aiContent || aiContent.length < 10) {
    console.warn(`  ⚠️ [m6] AI returned empty content for ${product.asin}. Using template fallback.`);
    const fb = buildTemplateFallback(product);
    cache.set(cacheKey, fb.title);
    return fb.title;
  }

  // --- SMART TITLE ASSEMBLY ---
  // Clean the brand from Amazon store prefix (e.g. "Visit the JAWAI Store" -> "JAWAI")
  let brandName = String(product.brand || "").trim();
  const visitMatch = brandName.match(/^Visit the (.+?) Store$/i);
  if (visitMatch) brandName = visitMatch[1].trim();
  const brandPrefixMatch = brandName.match(/^Brand:\s*(.+)$/i);
  if (brandPrefixMatch) brandName = brandPrefixMatch[1].trim();
  brandName = brandName.replace(/\s+Official Store$/i, '').trim();

  let title = aiContent;

  // STRICT RULE: Never inject "Нет бренда" into the title
  const isNoBrand = brandName.toLowerCase() === 'net brenda' || brandName.toLowerCase() === 'нет бренда' || brandName.toLowerCase() === 'no brand';

  // Insert brand after first word (the Type) if AI didn't include it
  if (!isNoBrand && brandName && !title.toLowerCase().includes(brandName.toLowerCase())) {
    const words = title.split(' ');
    const type = words.shift();
    title = `${type} ${brandName} ${words.join(' ')}`.trim();
  }

  // Double check "Нет бренда" wasn't snuck in by AI
  title = title.replace(/Нет бренда/gi, '');

  // ─── POST-PROCESSING (v56 Hardened) ───

  // Format Brand Name to Title Case to prevent ALL CAPS errors
  const formattedBrand = brandName.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  
  // 1. Remove ONLY invalid punctuation and known spam tokens, preserve English variations/shades
  // (We removed the aggressive block that stripped all Latin characters because it destroyed shades like "Light Pecan")

  // 2. Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // 3. Grammar polish
  title = finalPolish(title);

  // 4. STRICT TITLE CLEANER (core corruption removal)
  title = strictTitleClean(title);

  // 5. Final Ozon cleaner
  title = cleanForOzon(title);

  // 6. Punctuation normalization
  title = title.replace(/[.,:;\-]{2,}/g, ',');  // multiple punct -> comma
  title = title.replace(/\s+,/g, ',');
  title = title.replace(/,([^\s])/g, ', $1');
  title = title.replace(/^[.,:;\-\s]+/, '');
  title = title.replace(/[.,:;\-\s]+$/, '');
  title = title.replace(/\s+/g, ' ').trim();

  // 7. Deduplication
  title = deduplicateTitle(title);

  // 8. Final sentence case
  title = title.charAt(0).toUpperCase() + title.slice(1);
  title = title.slice(0, 200).trim();

  // 9. FINAL CORRUPTION CHECK — if still garbage, use template fallback
  const hasCyrillic = /[а-яА-ЯёЁ]/.test(title);
  const hasGarbage = /^[\d\s,.\-]+$/.test(title) || title.length < 10;
  if (!hasCyrillic || hasGarbage) {
    console.warn(`  ⚠️ [m6] Title still corrupted after all cleanup for ${product.asin}. Using template fallback.`);
    const fb = buildTemplateFallback(product);
    cache.set(cacheKey, fb.title);
    return fb.title;
  }

  // ─── SEO KEYWORD ENFORCEMENT ────────────────────────────────────────────────
  // Detect the primary Russian category keyword and ensure it appears early in the title.
  const RU_KEYWORD_MAP = {
    "hair oil"        : "Масло для волос",
    "shampoo"         : "Шампунь",
    "conditioner"     : "Кондиционер",
    "hair serum"      : "Сыворотка для волос",
    "hair mask"       : "Маска для волос",
    "face wash"       : "Гель для умывания",
    "face cream"      : "Крем для лица",
    "serum"           : "Сыворотка для лица",
    "body lotion"     : "Лосьон для тела",
    "body wash"       : "Гель для душа",
    "scrub"           : "Скраб",
    "sunscreen"       : "Солнцезащитный крем",
    "moisturizer"     : "Увлажняющий крем",
    "cream"           : "Крем",
    "oil"             : "Масло",
    "soap"            : "Мыло",
    "toner"           : "Тоник",
    "eye cream"       : "Крем для глаз",
    "lip balm"        : "Бальзам для губ",
    "capsule"         : "Капсулы",
    "tablet"          : "Таблетки",
    "supplement"      : "Биодобавка",
    "powder"          : "Порошок",
    "masala"          : "Масала",
    "spice"           : "Специи",
    "honey"           : "Мёд",
    "seeds"           : "Семена",
    "nuts"            : "Орехи"
  };

  // Detect primary keyword from the original Amazon product name
  let primaryKeywordRu = "";
  const nameLower = (product.name || "").toLowerCase();
  for (const [en, ru] of Object.entries(RU_KEYWORD_MAP)) {
    if (nameLower.includes(en)) { primaryKeywordRu = ru; break; }
  }

  // Ensure the primary keyword is present in the title, without breaking the "Brand -> Product Type" format
  if (primaryKeywordRu && title && !title.toLowerCase().includes(primaryKeywordRu.toLowerCase())) {
    const cleanTitle = title.replace(new RegExp('^' + formattedBrand, 'i'), '').trim();
    title = `${formattedBrand} ${primaryKeywordRu.toLowerCase()} ${cleanTitle}`.replace(/\s+/g, ' ').slice(0, 200).trim();
  }

  cache.set(cacheKey, title);
  return title;
}

// ─── SHORT ANNOTATION (Ozon field 4191) — MAX 500 CHARS, SEO-optimised ───────
async function generateAnnotation(product, cache) {
  const cacheKey = `annotation_seo_v8_${product.asin}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const systemPrompt = `You are a Russian Ozon SEO copywriter.
Write a SHORT product annotation for Ozon marketplace (field: Краткое описание).

STRICT RULES:
1. LANGUAGE: Pure Russian Cyrillic. Brand name stays in Latin.
2. LENGTH: MAXIMUM 480 CHARACTERS total. Hard limit — do not exceed.
3. SEO: Front-load the top 2-3 search keywords naturally (category + product type + benefit).
4. STRUCTURE: 2-3 short sentences — What is it + Key benefit + Who it is for.
5. NO HASHTAGS. NO hype words (лучший, уникальный). NO promotional offers.
6. PROHIBITED: Never write Ashwagandha, Gokshura, Tribulus — use растительный экстракт.
7. FORMAT: Return ONLY the annotation text. No labels, no preamble.`;

  const userPrompt = `BRAND: ${product.brand}
PRODUCT: ${product.name}
CATEGORY: ${product.product_category || 'N/A'}
KEY FEATURES: ${(product.feature_bullets || []).slice(0, 3).join('; ')}`;

  let text = await callAI(systemPrompt, userPrompt);

  if (!text || text.trim().length < 10) {
    const fb = buildTemplateFallback(product);
    text = fb.annotation;
  }

  text = sanitizeProhibitedWords(text);
  text = finalPolish(text);

  // Hard-enforce 500 char limit — truncate at last full sentence
  if (text.length > 500) {
    const truncated = text.slice(0, 497);
    const lastDot = truncated.lastIndexOf('.');
    text = lastDot > 150 ? truncated.slice(0, lastDot + 1) : truncated.trim() + '…';
  }

  const brandName = String(product.brand || "").trim();
  if (text.length < 20) {
    text = `${brandName} — натуральное средство для здоровья и красоты.`;
  }

  cache.set(cacheKey, text);
  return text;
}

// ─── LONG DESCRIPTION (Ozon description field) — 1500-2500 CHARS, rich SEO ───
async function generateDescription(product, cache) {
  const cacheKey = `description_rich_v8_${product.asin}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const systemPrompt = `You are a professional Russian copywriter for the Ozon marketplace.
Write a rich, comprehensive product description in natural Russian.

STRICT RULES:
1. LANGUAGE: Pure Russian Cyrillic (Brand name stays in Latin).
2. LENGTH: 1500-2500 CHARACTERS total. Comprehensive and highly informative to maximize Ozon Content Rating.
3. STRUCTURE — write 4-5 well-structured paragraphs covering:
   • Развернутое описание продукта, бренда и его истории
   • Ключевые ингредиенты, состав и детальные характеристики
   • Полные преимущества и польза при регулярном использовании
   • Для кого предназначен, подробная инструкция и советы по применению
4. GRAMMAR: Natural, correct Russian — no machine-translated fragments.
5. NO HASHTAGS. NO keyword stuffing. NO hype (лучший, уникальный, революционный).
6. ACCURACY: Only state facts from the provided data.
7. PROHIBITED: Never write Ashwagandha — use растительный экстракт. Never write Gokshura or Tribulus.
8. FORMAT: Return ONLY the description text. No preamble. No labels.`;

  const userPrompt = `BRAND: ${product.brand}\nPRODUCT: ${product.name}\nCATEGORY: ${product.product_category || 'N/A'}\nINGREDIENTS: ${product.ingredients || 'N/A'}\nFEATURES: ${(product.feature_bullets || []).join('; ')}\nDESCRIPTION: ${product.description || 'N/A'}`;

  let text = await callAI(systemPrompt, userPrompt);

  if (!text || text.trim().length < 20) {
    console.warn(`  ⚠️ [m6] AI returned empty description for ${product.asin}. Using template fallback.`);
    const fb = buildTemplateFallback(product);
    text = fb.annotation;
  }

  text = sanitizeProhibitedWords(text);
  text = finalPolish(text);

  const brandName = String(product.brand || "").trim();
  if (text.length < 80) {
    text = `${brandName} — профессиональное средство на основе качественных компонентов. ${text}`.trim();
  }

  cache.set(cacheKey, text);
  return text;
}

async function generateMethodOfUse(product, cache) {
  const cacheKey = `directions_v5_${product.asin}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const systemPrompt = `You are a professional Russian beauty product guide.
Generate SHORT, product-specific usage directions in Russian.
STRICT RULES:
1. LENGTH: 2 to 3 lines max.
2. PRODUCT-SPECIFIC: Must match the product type (e.g., face wash, serum, shampoo).
3. NO REPETITION: Do not use the same generic sentence for all products.
4. NO NUMBERED LISTS unless it makes the text shorter.
5. NO PREAMBLE: Return ONLY the text.`;

  const userPrompt = `Product: ${product.name}, Category: ${product.product_category}, Original Directions: ${product.directions || "N/A"}`;
  let result = await callAI(systemPrompt, userPrompt);
  
  result = sanitizeProhibitedWords(result);
  
  cache.set(cacheKey, result);
  return result;
}

export async function generateHashtags(product, typeLabel = "") {
  const systemPrompt = `You are a Russian Ozon SEO specialist generating product hashtags for marketplace listings.

  TASK: Generate 5 to 8 highly relevant, PRODUCT-SPECIFIC and CATEGORY-SPECIFIC Ozon SEO hashtags.

  STEP 1 — Detect the product category from the title, category field, and Ozon type.
  STEP 2 — Select hashtags relevant to THAT specific category. Never mix categories.
  STEP 3 — Select hashtags relevant to the product's specific ingredients or features.
  STEP 4 — Return the hashtags in the correct Ozon format.

  CATEGORY HASHTAG GUIDE (use as a reference for the detected category):
  Homeopathy:   #гомеопатия #гомеопатическоесредство #натуральноелечение #иммунитет #пищеварение #дыхание
  Ayurveda:     #аюрведа #травы #растительныесредства #натуральное #аюрведическое #здоровье
  Skincare:     #уходзакожей #сыворотка #увлажнение #антиакне #витаминС #керамиды #уф
  Hair care:    #уходзаволосами #маслодляволос #роствол #силаволос #кожаголовы #питание
  Food/Snacks:  #снек #здоровыйперекус #пп #полезноепитание #суперфуд #орехи #махана
  Supplements:  #здоровье #питание #бад #диета #витамины #иммунитет #поддержказдоровья
  Spices:       #специи #приправа #масала #индийскиеспеции #натуральное #кулинария

  CRITICAL FORMAT RULES (Ozon will REJECT violations):
  1. Every hashtag MUST start with #.
  2. Separate hashtags with ONE SPACE only.
  3. NO SPACES inside a hashtag. Compound words MUST be joined: #уходзакожей NOT #уход за кожей
  4. Each hashtag INCLUDING # must be UNDER 30 CHARACTERS total.
  5. Return ONLY the hashtag string. No numbered lists, no explanations.

  STRICTLY PROHIBITED in hashtags:
  - Brand names or seller names (NEVER INCLUDE THE BRAND AS A HASHTAG! e.g., NO #Himalaya, NO #Livon, NO #Matrix)
  - Promotional or discount words (скидка, акция, лучший, sale, хит)
  - ASINs, SKUs, or shipment IDs
  - Ashwagandha, withania (prohibited ingredients)`;

  const userPrompt = `Product Name: ${product.name}
Category: ${product.product_category || "N/A"}
Ozon Type: ${typeLabel || "N/A"}
Ingredients: ${product.ingredients || "N/A"}
Search Keyword: ${product.scraped_keyword || "N/A"}
Key Features: ${(product.feature_bullets || []).slice(0, 6).join(' | ')}`;

  const result = await callAI(systemPrompt, userPrompt);
  let polished = finalPolish(result);
  
  // ─── Dynamic brand word extraction ──────────────────────────────────────────
  // Extract every meaningful word from the Amazon brand field so they can ALL be
  // blocked from hashtags — handles "Dr Bakshi's Bakson's Homoeopathy" → {bakshi, bakson, homoeopathy}
  const brandWords = new Set(
    String(product.brand || "")
      .toLowerCase()
      .replace(/'s\b/g, '')                      // strip possessives
      .replace(/[^a-zA-Zа-яёА-ЯЁ\s]/g, ' ')     // keep only letters
      .split(/\s+/)
      .filter(w => w.length >= 3)                 // skip very short words
  );
  // Also add the collapsed full brand string (without spaces) for compound-brand matches
  const brandCollapsed = String(product.brand || "").toLowerCase().replace(/[^a-zA-Zа-яёА-ЯЁ]/g, '');
  if (brandCollapsed.length >= 3) brandWords.add(brandCollapsed);

  const promoWords = [
    'лучш', 'скидк', 'акци', 'распродаж', 'хит', 'hit', 'топ', 'top', 'нью', 'new', 'sale', 'best',
    'трен', 'trend', 'подар', 'премиум', 'premium', 'оригинал', 'original', 'выгод',
    'дешев', 'супер', 'super', 'новинк', 'номер1', 'рекоменд', 'hot', 'amazon', 'choice'
  ];
  // Known brand names (common Indian + global) — static blocklist
  const knownBrands = new Set([
    'himalaya','himalayaherbal','minimalist','garnier','mamaearth','loreal','lakme',
    'dove','ponds','nivea','neutrogena','olay','cetaphil','biotique','vicco',
    'vlcc','patanjali','dabur','emami','bajaj','shahnaz','lotus','jovees',
    'kama','forest','plum','wow','mcaffeine','pilgrim','derma','cosrx',
    'burt','cerave','laneige','innisfree','facetheory','paulaschoice',
    'ordinary','clinique','estee','lancome','shiseido','sk2','skii',
    'tresemme','pantene','herbal','essences','sunsilk','indulekha',
    'kesh','vedix','traya','aveda','kerastase','schwarzkopf','bblunt',
    'kapiva','zandu','vaidyaratnam','sandu','sbl','reckeweg',
    'boiron','schwabe','willmar','adel','blooume','bjain',
    'nestle','britannia','haldirams','mtr','mdh','everest','catch',
    'shan','mehran','aachi','ramdev','bakson','bakshi','morepen',
    'sbl','baidyanath','charak','hamdard','unani','ayur'
  ]);

  // Helper: returns true if the tag body should be blocked as a brand/promo name
  const isBrandTag = (tagBody) => {
    const t = tagBody.toLowerCase().replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, '');
    // 1. Block if it matches any word extracted from product's own brand field
    if (brandWords.has(t)) return true;
    // 2. Block if the collapsed brand string contains this tag
    if (brandCollapsed && brandCollapsed.includes(t) && t.length >= 4) return true;
    // 3. Block if it matches a known brand name exactly
    if (knownBrands.has(t)) return true;
    // 4. Block if a known brand is a prefix/suffix of this tag
    for (const kb of knownBrands) {
      if (t === kb || t.startsWith(kb) || t.endsWith(kb)) return true;
    }
    return false;
  };

  // STRICT HASHTAG PROCESSING — split on '#', strip spaces inside, filter, deduplicate
  let parsedTags = polished
    .split('#')
    .map(t => t
      .split(/\s+/)[0]           // first word only — prevents multi-word hashtags
      .replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, '') // strip all non-alphanumeric
    )
    .filter(t => t.length >= 2 && t.length <= 28)
    .filter(t => !isBrandTag(t))
    .filter(t => {
      const lower = t.toLowerCase();
      return !promoWords.some(pw => lower.includes(pw));
    })
    .map(t => {
      // sanitize the tag body BEFORE prepending # so replacements don't insert spaces
      const clean = sanitizeProhibitedWords(t).replace(/\s+/g, '').replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, '');
      return clean.length >= 2 ? '#' + clean : null;
    })
    .filter(Boolean);

  // Deduplicate, target minimum 5 and maximum 8
  let tags = [...new Set(parsedTags)].slice(0, 8);

  // Enrich to minimum 5 using keyword extraction from product data (brand-safe)
  if (tags.length < 5) {
    const seedText = [
      product.product_category || '',
      typeLabel || '',
      // intentionally exclude scraped_keyword and product.name as they contain brand names
      (product.feature_bullets || []).slice(0, 4).join(' ')
    ].join(' ');
    const seedTags = seedText
      .toLowerCase()
      .split(/[\s,;&>|]+/)
      .map(w => w.replace(/[^а-яёА-ЯЁa-zA-Z0-9]/g, ''))
      .filter(w => w.length >= 3 && w.length <= 28)
      .filter(w => !isBrandTag(w))
      .filter(w => !promoWords.some(pw => w.includes(pw)))
      .map(w => {
        const clean = sanitizeProhibitedWords(w).replace(/\s+/g, '').replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, '');
        return clean.length >= 2 ? '#' + clean : null;
      })
      .filter(Boolean);
    const extras = [...new Set(seedTags)].filter(t => !tags.includes(t)).slice(0, 8 - tags.length);
    tags = [...new Set([...tags, ...extras])].slice(0, 8);
  }

  // Fallback: use inferred category keyword only (stripped of brand noise)
  if (tags.length === 0) {
    const fallback = (typeLabel || 'продукт')
      .replace(/[^а-яёА-ЯЁa-zA-Z]/g, '')
      .toLowerCase()
      .slice(0, 28);
    if (fallback.length >= 2 && !isBrandTag(fallback)) tags = ['#' + fallback];
  }

  // Sanitize each tag BODY (without # ) so no spaces end up inside a hashtag
  const finalTags = tags
    .map(tag => {
      const body = tag.startsWith('#') ? tag.slice(1) : tag;
      const clean = sanitizeProhibitedWords(body).replace(/\s+/g, '').replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, '');
      return clean.length >= 2 ? '#' + clean : null;
    })
    .filter(Boolean);
  // Final format: "#tag1 #tag2 #tag3" — # prefix, space separated, no duplicates
  return [...new Set(finalTags)].slice(0, 8).join(' ');
}

export async function generateModelName(product, cache) {
  const cacheKey = `modelName_${product.asin}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const systemPrompt = `You are a professional retail specialist for Ozon.
Generate a short, clean, and meaningful Model Name (Название модели) in Russian.
FORMAT REQUIREMENT (BEST PRACTICE):
Product Name / Variant / Line

STRICT RULES:
1. It MUST be in Russian.
2. It MUST be short, clean, and meaningful.
3. NO promotional words (e.g., best, original, cheap).
4. Format MUST be separated by ' / '. Do NOT include the Brand name.
5. NO PREAMBLE: Return ONLY the formatted text.
Example: Очищающий гель / С витамином С / Brightening Line`;

  const userPrompt = `Product Title: ${product.name}\nBrand: ${product.brand}`;
  let result = await callAI(systemPrompt, userPrompt);
  
  // Validate and clean
  if (!result || result.includes("Error:")) {
      result = (product.name || "Косметический продукт").slice(0, 100);
  }
  
  result = result.slice(0, 255); // Ozon max length
  
  result = sanitizeProhibitedWords(result);

  cache.set(cacheKey, result);
  return result;
}

export async function generateKeywordsRu(product, typeLabel = "") {
  const systemPrompt = `You are a Russian Ozon SEO expert.
Generate the TOP 3 most searchable Russian keywords for this product on Ozon.
RULES:
1. Return ONLY a comma-separated list of 3 keyword phrases.
2. Each phrase is 2-5 words, in Russian Cyrillic.
3. Start with the most important category keyword (e.g. "Масло для волос").
4. No brand names, no hashtags, no explanations.
Example: Масло для волос, уход за волосами, натуральное масло`;

  const userPrompt = `Product: ${product.name}\nCategory: ${product.product_category || typeLabel || 'N/A'}\nBrand: ${product.brand || 'N/A'}`;
  const raw = await callAI(systemPrompt, userPrompt);
  if (!raw) return "";
  return sanitizeProhibitedWords(raw.replace(/\n/g, ", ").slice(0, 200));
}

export async function translateProduct(product, typeLabel = "") {
  const cache = await loadCache();
  const [title_ru, annotation_ru, description_ru, method_of_use, model_name] = await Promise.all([
    generateSeoTitle(product, cache, typeLabel),
    generateAnnotation(product, cache),      // ≤500 chars — Ozon field 4191 (Краткое описание)
    generateDescription(product, cache),     // 1500-2500 chars — Ozon description field
    generateMethodOfUse(product, cache),
    generateModelName(product, cache)
  ]);

  // ─── Shade/Variant suffix for cosmetic children ──────────────────────────────
  // When variant_value is set (e.g. "Ivory", "120 Classic Ivory"), append it to
  // the title so each child listing has a unique, descriptive name on Ozon.
  let finalTitle = title_ru;
  if (product.variant_value && product.variant_type) {
    const shadeLabel = String(product.variant_value).trim().slice(0, 40);
    // Only append if not already in the title (case-insensitive check)
    if (shadeLabel && !finalTitle.toLowerCase().includes(shadeLabel.toLowerCase())) {
      finalTitle = `${finalTitle}, оттенок ${shadeLabel}`.slice(0, 200).trim();
    }
  }
  const [hashtags, keywords_ru] = await Promise.all([
    generateHashtags(product, typeLabel),
    generateKeywordsRu(product, typeLabel)
  ]);
  
  // SMART COMPOSITION EXTRACTION
  let ingredientsText = extractComposition(product);
  
  // If still missing, use a safe descriptive composition based on title
  if (!ingredientsText || ingredientsText === "N/A" || ingredientsText.length < 5) {
      ingredientsText = "Water, Glycerin, Natural Extracts"; 
  }

  const composition = ingredientsText ? (await translateStrings([ingredientsText]))[0].slice(0, 1000) : "N/A";
  const bullets_ru = product.feature_bullets ? await translateStrings(product.feature_bullets) : [];

  await saveCache(cache);
  return { title_ru: finalTitle, annotation_ru, description_ru, bullets_ru, hashtags, keywords_ru, method_of_use, model_name, composition };
}
