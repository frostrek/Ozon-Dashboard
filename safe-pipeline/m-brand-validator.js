#!/usr/bin/env bun
/**
 * m-brand-validator.js  (v2 — Full Audit Layer)
 * Pre-upload brand consistency validation.
 *
 * Exports:
 *  detectOtherBrand(text, ownBrand)           → { found, culprit }
 *  ensureBrandPresent(text, ownBrand)          → { text, changed }
 *  validateAndCorrectBrand(ai, ownBrand)       → { ai, valid, corrections }
 *  validateCharacteristics(attrs, ownBrand)    → { attrs, corrections }
 *  isValidBrandValue(value)                    → boolean
 *  buildBrandAudit(ai, brand, attrs, images)   → auditObj
 *  saveBrandAudit(auditObj, asin)              → void
 *  preUploadGate(ai, brand, images, attrs)     → { pass, blockers, warnings }
 */

import path from "path";

// ── Known competing / Indian brand names (lowercase, no spaces) ────────────────
export const KNOWN_OTHER_BRANDS = new Set([
  "himalaya","himalayaherbal","himalayababycare","minimalist","garnier",
  "mamaearth","patanjali","loreal","lakme","ponds","nivea",
  "neutrogena","olay","cetaphil","biotique","vicco","vlcc","shahnaz",
  "jovees","kama","wow","mcaffeine","pilgrim",
  "cosrx","cerave","laneige","innisfree","clinique","estee","lancome",
  "shiseido","pantene","sunsilk","indulekha","kesh","vedix","traya",
  "aveda","kerastase","schwarzkopf","bblunt","kapiva","zandu","sandu",
  "sbl","reckeweg","boiron","schwabe","bjain","bakson","bakshi","morepen",
  "baidyanath","charak","hamdard","willmar","blooume","adel",
  "britannia","haldirams","mtr","mdh","everest","mehran",
  "aachi","ramdev","dabur","emami","bajaj","parachute","marico","derma",
  "khadi", "tatasampann", "vedaka"
]);

// ── Geographic / ingredient descriptors that look like brand names but are NOT ──
// e.g. "himalayan" (adjective, mountain origin) ≠ brand "himalaya"
// e.g. "vedic" (adjective) ≠ brand "vedix"
const GEOGRAPHIC_WHITELIST = new Set([
  "himalayan",    // Himalayan salt / shilajit / origin — NOT the brand Himalaya
  "himalaya mountains",
  "pure himalayan",
  "vedic",        // Vedic tradition — NOT brand Vedix
  "ayurvedic",    // Ayurvedic practice — generic term
]);

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Collapse a brand name to a compact lowercase key, e.g. "Khadi Natural" → "khadinatural" */
function collapseKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, "");
}

/** Extract meaningful word-tokens from a brand name, skip short/common prefixes */
function brandTokens(name) {
  const skip = new Set(["dr","mr","mrs","ms","prof","the","by","and","of","for","co","ltd","pvt","inc","llc"]);
  return String(name || "")
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^a-zA-Zа-яёА-ЯЁ\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !skip.has(w));
}

/**
 * Returns true if `text` contains a brand that is NOT the expected brand.
 * @returns {{ found: boolean, culprit: string|null }}
 */
export function detectOtherBrand(text, ownBrand) {
  if (!text) return { found: false, culprit: null };
  const lower = text.toLowerCase();
  const ownKey = collapseKey(ownBrand);
  const ownToks = brandTokens(ownBrand);
  for (const brand of KNOWN_OTHER_BRANDS) {
    if (brand === ownKey) continue;
    if (ownKey.includes(brand) || brand.includes(ownKey)) continue;
    if (ownToks.some(t => brand.includes(t) || t.includes(brand))) continue;

    // ── Whole-word match only (not substring) ─────────────────────────────────
    // e.g. "himalayan" must NOT match brand "himalaya"
    // We use a word-boundary-like regex: brand must be surrounded by non-alpha chars
    const wordRe = new RegExp(`(?<![a-zA-Zа-яёА-ЯЁ])${brand}(?![a-zA-Zа-яёА-ЯЁ])`, 'i');
    if (!wordRe.test(lower)) continue;

    // ── Geographic / ingredient false-positive whitelist ──────────────────────
    // If the matching context is a known adjective form, skip it.
    // E.g. "himalayan shilajit" or "pure himalayan" should NOT block.
    const geoSkip = [...GEOGRAPHIC_WHITELIST].some(geo => lower.includes(geo));
    if (geoSkip && brand === 'himalaya') continue;

    return { found: true, culprit: brand };
  }
  return { found: false, culprit: null };
}

/**
 * Ensure the text contains ownBrand at the start.
 * If missing, prepend it.
 */
export function ensureBrandPresent(text, ownBrand) {
  if (!text || !ownBrand) return { text, changed: false };
  const collapseFull = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  
  const lowerText = collapseFull(text);
  const fullBrandMatch = collapseFull(ownBrand);
  const compactBrandMatch = collapseKey(ownBrand);
  
  // Extract the primary first word, e.g. "Maybelline" out of "Maybelline New York"
  const firstWordMatch = fullBrandMatch.split(/\s+/).filter(w => w.length >= 4)[0];
  
  if (lowerText.includes(fullBrandMatch) || 
      lowerText.includes(compactBrandMatch) || 
      (firstWordMatch && lowerText.includes(firstWordMatch))) {
    
    // It's already there! But let's avoid "Maybelline New York Maybelline" if we were to prepend.
    // Actually, just return unchanged.
    return { text, changed: false };
  }
  return { text: `${ownBrand} ${text}`, changed: true };
}

// ── Brand validity gate ───────────────────────────────────────────────────────

/** Returns true only if brandValue is a legitimate, non-fragment brand name */
export function isValidBrandValue(value) {
  if (!value || typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 3) return false;
  if (/^[A-Z]{1,4}$/.test(v)) return false;           // ALL-CAPS initials: S, SH, GAR, FARA
  if (/^[A-Za-z]{1,2}$/.test(v)) return false;        // 1-2 letter fragments
  if (/^\d+$/.test(v)) return false;                   // purely numeric
  if (/^[^a-zA-Z\u0400-\u04FF]+$/.test(v)) return false; // no letters at all
  const SPURIOUS = new Set(["mi","he","sh","s","m","se","dr","mr","pk","he","hi","by","professional","store"]);
  if (SPURIOUS.has(v.toLowerCase())) return false;
  return true;
}

// ── Title / Description / Hashtag brand validation ────────────────────────────

/**
 * Validate and auto-correct title, description, annotation, hashtags.
 * Returns { ai: correctedAiObj, valid: boolean, corrections: string[] }
 */
export function validateAndCorrectBrand(ai, ownBrand) {
  const corrections = [];

  // ── 1. Title ──────────────────────────────────────────────────────────────
  {
    const { found, culprit } = detectOtherBrand(ai.title_ru, ownBrand);
    if (found) corrections.push(`TITLE contains foreign brand "${culprit}" — prepended own brand`);
    const { text, changed } = ensureBrandPresent(ai.title_ru, ownBrand);
    if (changed) { corrections.push(`TITLE missing brand "${ownBrand}" — prepended`); ai = { ...ai, title_ru: text }; }
  }

  // ── 2. Description ────────────────────────────────────────────────────────
  {
    const descText = ai.description_ru || ai.annotation_ru || "";
    const { found, culprit } = detectOtherBrand(descText, ownBrand);
    if (found) corrections.push(`DESCRIPTION contains foreign brand "${culprit}"`);
    const { text, changed } = ensureBrandPresent(descText, ownBrand);
    if (changed) corrections.push(`DESCRIPTION missing brand "${ownBrand}" — prepended`);
    ai = { ...ai, description_ru: text, annotation_ru: text };
  }

  // ── 3. Hashtags — no brand names allowed ──────────────────────────────────
  if (ai.hashtags) {
    const ownTokensSet = new Set(brandTokens(ownBrand));
    ownTokensSet.add(collapseKey(ownBrand));
    const rawTags = String(ai.hashtags);
    const filtered = rawTags.split("#")
      .map(t => t.split(/\s+/)[0].replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, ""))
      .filter(t => t.length >= 2)
      .filter(t => {
        const lower = t.toLowerCase();
        if (ownTokensSet.has(lower) || lower.includes(collapseKey(ownBrand))) return false;
        for (const b of KNOWN_OTHER_BRANDS) {
          if (lower === b || lower.startsWith(b) || lower.endsWith(b)) return false;
        }
        return true;
      })
      .map(t => "#" + t);
    const cleanHt = [...new Set(filtered)].slice(0, 8).join(" ");
    if (cleanHt !== rawTags) {
      corrections.push("HASHTAGS contained brand names — removed");
      ai = { ...ai, hashtags: cleanHt };
    }
  }

  // ── 4. Light check on method_of_use / composition ─────────────────────────
  for (const field of ["method_of_use", "composition"]) {
    if (!ai[field]) continue;
    const { found, culprit } = detectOtherBrand(ai[field], ownBrand);
    if (found) corrections.push(`${field.toUpperCase()} contains foreign brand "${culprit}" (review recommended)`);
  }

  return { ai, valid: corrections.length === 0, corrections };
}

// ── Characteristics validation ────────────────────────────────────────────────

/**
 * Scan all Ozon attributes (mandatory + filled) for brand mismatches.
 * Attribute id=85 is Brand — its value MUST match ownBrand.
 * Any string value containing a foreign brand is corrected.
 *
 * @param {object[]} attrs    - finalAttrs array from m9
 * @param {string}   ownBrand - resolved brand value (e.g. "Khadi Natural")
 * @returns {{ attrs: object[], corrections: string[] }}
 */
export function validateCharacteristics(attrs, ownBrand) {
  const corrections = [];
  const ownKey = collapseKey(ownBrand);

  const correctedAttrs = attrs.map(attr => {
    // Deep clone to avoid mutating original
    const a = JSON.parse(JSON.stringify(attr));

    a.values = (a.values || []).map(v => {
      if (typeof v.value !== "string") return v;

      // Brand attribute (id=85): enforce exact match
      if (a.id === 85) {
        if (collapseKey(v.value) !== ownKey && collapseKey(v.value) !== collapseKey("Нет бренда")) {
          corrections.push(`Attr id=85 (Brand) had "${v.value}" — corrected to "${ownBrand}"`);
          return { ...v, value: ownBrand };
        }
        return v;
      }

      // All other string attributes: detect + flag foreign brand
      const { found, culprit } = detectOtherBrand(v.value, ownBrand);
      if (found) {
        corrections.push(`Attr id=${a.id} contains foreign brand "${culprit}" — removed reference`);
        // Replace the foreign brand occurrence with own brand
        const regex = new RegExp(culprit, "gi");
        return { ...v, value: v.value.replace(regex, ownBrand) };
      }
      return v;
    });
    return a;
  });

  return { attrs: correctedAttrs, corrections };
}

// ── Brand Audit Report ────────────────────────────────────────────────────────

/**
 * Detect the brand name mentioned in a block of text.
 * Returns the suspected brand slug found, or the ownBrand if consistent.
 */
function detectBrandInText(text, ownBrand) {
  if (!text) return null;
  const collapseFull = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const lowerText = collapseFull(text);
  const lowerBrand = collapseFull(ownBrand);
  
  // Check if own brand is present
  if (lowerText.includes(lowerBrand)) return ownBrand;
  // Check for known other brands
  for (const b of KNOWN_OTHER_BRANDS) {
    if (lowerText.includes(collapseFull(b))) return b;
  }

  // Fallback: Check if the first word of ownBrand is present (e.g. "Tata" in "Tata Sampann")
  const firstWord = lowerBrand.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 4 && lowerText.includes(firstWord)) return ownBrand;

  return null; // not determinable
}

/**
 * Build the brand audit object.
 *
 * @param {object}   ai      - translated AI content (title_ru, description_ru, etc.)
 * @param {object}   brand   - resolved brand { id, value }
 * @param {object[]} attrs   - finalAttrs array
 * @param {string[]} images  - re-hosted image URLs
 * @returns {object} auditObj
 */
export function buildBrandAudit(ai, brand, attrs, images = []) {
  const ownBrand = brand.value;

  // Extract brand from title
  const titleBrand = detectBrandInText(ai.title_ru, ownBrand) || "NOT FOUND";
  // Extract brand from description
  const descBrand  = detectBrandInText(ai.description_ru || ai.annotation_ru, ownBrand) || "NOT FOUND";
  // Extract brand from characteristics (look at attr id=85)
  const brandAttr  = attrs.find(a => a.id === 85);
  const charBrand  = brandAttr?.values?.[0]?.value || "NOT FOUND";
  // Image brand: heuristic URL scan
  let imageBrand = ownBrand;
  for (const url of images) {
    const { found, culprit } = detectOtherBrand(url, ownBrand);
    if (found) { imageBrand = culprit; break; }
  }

  // Determine status
  const collapse = (s) => String(s || "").toLowerCase().replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, "");
  
  // charBrand is allowed to be "Нет бренда" as a fallback even if ownBrand is a target brand.
  const charMatches = collapse(charBrand) === collapse(ownBrand) || charBrand.toLowerCase() === "нет бренда";

  const allMatch =
    collapse(titleBrand) === collapse(ownBrand) &&
    collapse(descBrand)  === collapse(ownBrand) &&
    charMatches &&
    collapse(imageBrand) === collapse(ownBrand);

  const audit = {
    brand_field            : ownBrand,
    title_brand            : titleBrand,
    description_brand      : descBrand,
    characteristics_brand  : charBrand,
    image_brand            : imageBrand,
    status                 : allMatch ? "PASS" : "FAIL",
    mismatches             : []
  };

  if (collapse(titleBrand) !== collapse(ownBrand))  audit.mismatches.push("title");
  if (collapse(descBrand)  !== collapse(ownBrand))  audit.mismatches.push("description");
  if (!charMatches)                                 audit.mismatches.push("characteristics");
  if (collapse(imageBrand) !== collapse(ownBrand))  audit.mismatches.push("image");

  return audit;
}

/**
 * Write brand_audit.json (one file per ASIN) to the pipeline root.
 */
export async function saveBrandAudit(auditObj, asin) {
  try {
    const dir  = path.join(process.cwd(), "brand-audits");
    // Create directory if missing
    try { await import("fs").then(fs => fs.promises.mkdir(dir, { recursive: true })); } catch {}
    const file = path.join(dir, `brand_audit_${asin}.json`);
    await Bun.write(file, JSON.stringify(auditObj, null, 2));
    console.log(`  📋 Brand audit saved: brand-audits/brand_audit_${asin}.json`);
  } catch (err) {
    console.warn(`  ⚠️  Could not save brand audit: ${err.message}`);
  }
}

// ── Full Pre-Upload Gate ──────────────────────────────────────────────────────

/**
 * Final upload safety gate. Blocks push if any critical check fails.
 *
 * Checks:
 *  1. Brand field valid (not fragment / initials)
 *  2. Brand in title matches brand_field
 *  3. Brand in description matches brand_field
 *  4. Characteristics brand_field matches (via audit)
 *  5. Image URL heuristic — no other brand
 *  6. No brand names in hashtags
 *  7. Primary SEO keyword in title
 *
 * @param {object}   ai         - translated AI content
 * @param {object}   brand      - resolved brand { id, value }
 * @param {string[]} images     - re-hosted image URLs
 * @param {object[]} attrs      - finalAttrs (already characteristics-validated)
 * @param {string}   keywords_ru - comma-separated Russian keywords
 * @param {object}   product    - original product info containing variant details
 * @param {boolean}  isCosmeticCategory - is cosmetic product indicator
 * @returns {{ pass: boolean, blockers: string[], warnings: string[] }}
 */
export function preUploadGate(ai, brand, images = [], attrs = [], keywords_ru = "", product = {}, isCosmeticCategory = false) {
  const blockers = [];
  const warnings = [];
  const ownBrand = brand.value;

  // ── 1. Brand field validity ──────────────────────────────────────────────
  if (!isValidBrandValue(ownBrand) && ownBrand !== "Нет бренда") {
    blockers.push(`Brand value "${ownBrand}" looks invalid (fragment/initials)`);
  }

  // ── 2. Title has Cyrillic ────────────────────────────────────────────────
  if (!ai.title_ru || !/[а-яА-ЯёЁ]/.test(ai.title_ru)) {
    blockers.push("Title missing Cyrillic content");
  }

  // ── 3. Description has Cyrillic ──────────────────────────────────────────
  if (!ai.description_ru || !/[а-яА-ЯёЁ]/.test(ai.description_ru)) {
    blockers.push("Description missing Cyrillic content");
  }

  // ── 4. Title contains brand ──────────────────────────────────────────────
  if (ai.title_ru && !ai.title_ru.toLowerCase().includes(ownBrand.toLowerCase())) {
    warnings.push(`Title does not mention brand "${ownBrand}"`);
  }

  // ── 5. Title foreign brand check ─────────────────────────────────────────
  const titleBrandCheck = detectOtherBrand(ai.title_ru, ownBrand);
  if (titleBrandCheck.found) {
    blockers.push(`Title contains competing brand "${titleBrandCheck.culprit}"`);
  }

  // ── 6. Description foreign brand check ───────────────────────────────────
  const descBrandCheck = detectOtherBrand(ai.description_ru, ownBrand);
  if (descBrandCheck.found) {
    blockers.push(`Description contains competing brand "${descBrandCheck.culprit}"`);
  }

  // ── 7. Characteristics brand_field (id=85) matches own brand ─────────────
  const brandAttr = attrs.find(a => a.id === 85);
  if (brandAttr) {
    const charVal = brandAttr.values?.[0]?.value || "";
    if (charVal === "Нет бренда" && ownBrand !== "Нет бренда") {
      warnings.push(`Amazon brand "${ownBrand}" not found in Ozon brand dictionary. Using fallback Ozon brand: Нет бренда.`);
    } else if (charVal.toLowerCase() !== ownBrand.toLowerCase() && charVal !== "Нет бренда") {
      blockers.push(`Characteristics Brand attr="${charVal}" !== Brand field="${ownBrand}"`);
    }
  }

  // ── 8. Hashtags — no brand names ─────────────────────────────────────────
  if (ai.hashtags) {
    const hashBrandCheck = detectOtherBrand(ai.hashtags, ownBrand);
    if (hashBrandCheck.found) {
      warnings.push(`Hashtags contain competing brand "${hashBrandCheck.culprit}"`);
    }
    const ownToks = brandTokens(ownBrand);
    const hashLower = ai.hashtags.toLowerCase();
    if (ownToks.some(t => hashLower.includes(t))) {
      warnings.push("Hashtags contain own brand name — will be filtered at push time");
    }
  }

  // ── 9. Image URL heuristic brand check ───────────────────────────────────
  for (let i = 0; i < images.length; i++) {
    const { found, culprit } = detectOtherBrand(images[i] || "", ownBrand);
    if (found) {
      warnings.push(`Image[${i}] URL suggests competing brand "${culprit}"`);
    }
  }

  // ── 10. Primary SEO keyword in title ─────────────────────────────────────
  if (keywords_ru) {
    const primaryKw = keywords_ru.split(/[,;]/)[0].trim();
    if (primaryKw && !/[а-яА-ЯёЁ]/.test(primaryKw)) {
      // not a Cyrillic keyword — skip
    } else if (primaryKw && ai.title_ru && !ai.title_ru.toLowerCase().includes(primaryKw.toLowerCase())) {
      warnings.push(`Primary SEO keyword "${primaryKw}" missing from title`);
    }
  }

  // ── 11. Strict Cosmetics Safety Gate (Color Rule Enforcer) ────────────
  if (isCosmeticCategory) {
     const hasShadeVal = !!(product.variant_value);
     let amazonHasColorOptions = false;
     
     if (product.customization_options) {
        try {
           const opts = typeof product.customization_options === 'string'
              ? JSON.parse(product.customization_options)
              : product.customization_options;
           amazonHasColorOptions = Array.isArray(opts) && opts.some(opt => 
              (opt.title && (opt.title.toLowerCase().includes('color') || opt.title.toLowerCase().includes('colour') || opt.title.toLowerCase().includes('shade'))) ||
              (opt.type && (opt.type.toLowerCase().includes('color') || opt.type.toLowerCase().includes('colour') || opt.type.toLowerCase().includes('shade')))
           );
        } catch(e) {}
     }

     // RULE: If color information is available on Amazon but missing in payload, stop processing and log an error.
     // Do NOT upload cosmetic products as standalone products if shade variants exist.
     if (amazonHasColorOptions && !hasShadeVal) {
        blockers.push(`Amazon has Color/Shade options for ${product.asin}, but no variant_value was provided (cannot upload as standalone).`);
     }

     if (hasShadeVal) {
        // Enforce Ozon Attributes are populated!
        const attr10096 = attrs.find(a => a.id === 10096);
        const attr10097 = attrs.find(a => a.id === 10097);

        if (!attr10096 || !attr10096.values || !attr10096.values[0] || (!attr10096.values[0].value && !attr10096.values[0].dictionary_value_id)) {
           blockers.push(`Ozon Color attribute (10096) is blank/missing but product has shade: ${product.variant_value}`);
        }
        if (!attr10097 || !attr10097.values || !attr10097.values[0] || !attr10097.values[0].value) {
           blockers.push(`Ozon Shade Name attribute (10097) is blank/missing but product has shade: ${product.variant_value}`);
        }
     }

     // RULE: No Multicolor fallback!
     const colorAttrs = attrs.filter(a => [8229, 10096].includes(a.id));
     for (const attr of colorAttrs) {
        if (attr.values) {
           const isMulticolor = attr.values.some(v => v.value === "Разноцветный" || v.value === "Multicolor" || parseInt(v.dictionary_value_id) === 3730);
           if (isMulticolor) {
              const safeMulti = product.variant_value && product.variant_value.toLowerCase().includes("multi");
              if (!safeMulti) {
                 blockers.push(`Cosmetic mapped to Generic/Multicolor (Разноцветный), but exact shade was ${product.variant_value || "unknown"}`);
              }
           }
        }
     }
  }

  const pass = blockers.length === 0;
  const color = pass ? "32" : "31";
  const header = pass
    ? `✅ PRE-UPLOAD GATE PASSED${warnings.length > 0 ? " (with warnings)" : ""}`
    : `❌ PRE-UPLOAD GATE FAILED (${blockers.length} blocker${blockers.length > 1 ? "s" : ""})`;

  console.log(`\x1b[${color}m  ${header}\x1b[0m`);
  blockers.forEach(b => console.log(`    \x1b[31mBLOCKER: ${b}\x1b[0m`));
  warnings.forEach(w => console.log(`    \x1b[33mWARNING: ${w}\x1b[0m`));

  return { pass, blockers, warnings };
}
