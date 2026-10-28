#!/usr/bin/env bun
/**
 * m-image-ocr-validator.js
 *
 * OCR-based brand validation for final product images before Ozon upload.
 *
 * Strategy:
 *  - Primary:  Google Cloud Vision API (if GOOGLE_VISION_KEY is set in .env)
 *  - Fallback: tesseract.js npm package (if installed)
 *  - Fallback2: URL-based heuristic scan (always available, no install needed)
 *
 * Usage:
 *   import { validateImageBrands } from "./m-image-ocr-validator.js";
 *   const { pass, results } = await validateImageBrands(imageUrls, brand.value);
 */

import { KNOWN_OTHER_BRANDS } from "./m-brand-validator.js";

const GOOGLE_VISION_KEY = Bun.env.GOOGLE_VISION_KEY || null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function collapseKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, "");
}

function brandTokens(name) {
  const skip = new Set(["dr","mr","mrs","ms","prof","the","by","and","of","for","co","ltd","pvt"]);
  return String(name || "")
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^a-zA-Zа-яёА-ЯЁ\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !skip.has(w));
}

/**
 * Scan extracted OCR text for competing brand names and verify own brand presence.
 * @param {string} ocrText   - text extracted from image
 * @param {string} ownBrand  - the product's own brand name
 * @returns {{ found: boolean, culprits: string[], ownPresent: boolean }}
 */
function scanOcrTextForBrands(ocrText, ownBrand) {
  if (!ocrText) return { found: false, culprits: [], ownPresent: false };
  const lower = ocrText.toLowerCase();
  const ownKey = collapseKey(ownBrand);
  const ownToks = brandTokens(ownBrand);
  const culprits = [];
  
  // Check if own brand is present
  const ownPresent = lower.includes(ownKey) || ownToks.some(t => lower.includes(t));

  // If Ozon brand is "Нет бренда", we cannot reliably determine "foreign" brands
  // because whatever is on the box is probably the TRUE brand (just unmapped).
  if (lower.includes("нетбренда") || ownKey === "нетбренда") {
      return { found: false, culprits: [], ownPresent: true };
  }

  for (const brand of KNOWN_OTHER_BRANDS) {
    // Skip if this IS the own brand
    if (brand === ownKey) continue;
    if (ownKey.includes(brand) || brand.includes(ownKey)) continue;
    if (ownToks.some(t => brand.includes(t) || t.includes(brand))) continue;

    // Check with word-boundary approximation
    const regex = new RegExp(`(?<![a-zA-Zа-яёА-ЯЁ])${brand}(?![a-zA-Zа-яёА-ЯЁ])`, "i");
    if (regex.test(lower)) culprits.push(brand);
  }

  return { found: culprits.length > 0, culprits, ownPresent };
}

// ── Google Vision OCR ─────────────────────────────────────────────────────────

async function ocrViaGoogleVision(imageUrl) {
  if (!GOOGLE_VISION_KEY) return null;
  try {
    const body = {
      requests: [{
        image: { source: { imageUri: imageUrl } },
        features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
      }]
    };
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const fullText = data?.responses?.[0]?.fullTextAnnotation?.text || "";
    return fullText.trim();
  } catch {
    return null;
  }
}

// ── tesseract.js OCR (if installed) ──────────────────────────────────────────

async function ocrViaTesseract(imageUrl) {
  try {
    // Dynamic import — only available if `npm install tesseract.js` was run
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng+rus");
    const { data: { text } } = await worker.recognize(imageUrl);
    await worker.terminate();
    return text.trim();
  } catch {
    return null; // tesseract.js not installed or failed
  }
}

// ── URL-Heuristic Fallback (no install needed) ────────────────────────────────

/**
 * Scans the image URL itself for brand name strings.
 * Limited accuracy — only catches images hosted under brand-named domains/paths.
 */
function ocrViaUrlHeuristic(imageUrl) {
  if (!imageUrl) return "";
  // Strip query params and protocol
  const pathname = (imageUrl.split("?")[0] || "").toLowerCase();
  return pathname;
}

// ── Main OCR dispatcher ───────────────────────────────────────────────────────

/**
 * Run OCR on a single image URL.
 * Returns extracted text (or "" if all methods fail).
 */
async function runOcr(imageUrl) {
  // 1. Google Vision (best quality, paid)
  const visionText = await ocrViaGoogleVision(imageUrl);
  if (visionText !== null) return visionText;

  // 2. tesseract.js (free, local, requires install)
  const tesseractText = await ocrViaTesseract(imageUrl);
  if (tesseractText !== null) return tesseractText;

  // 3. URL heuristic (always available)
  return ocrViaUrlHeuristic(imageUrl);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate all product images for brand consistency via OCR.
 *
 * @param {string[]} imageUrls  - array of image URLs to check
 * @param {string}   ownBrand   - the product's resolved brand name
 * @returns {Promise<{
 *   pass: boolean,
 *   results: Array<{ url: string, ocrText: string, culprits: string[], pass: boolean, ownPresent: boolean }>,
 *   ocrMethod: string
 * }>}
 */
export async function validateImageBrands(imageUrls, ownBrand) {
  const ocrMethod = GOOGLE_VISION_KEY
    ? "google_vision"
    : (await isTestable("tesseract.js") ? "tesseract" : "url_heuristic");

  const results = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    if (!url) continue;

    console.log(`  🔍 OCR check image ${i + 1}/${imageUrls.length}...`);
    const ocrText = await runOcr(url);
    const { found, culprits, ownPresent } = scanOcrTextForBrands(ocrText, ownBrand);

    const isMissingBrand = !ownPresent && ocrText.length > 5; // only complain if there is text but brand is missing

    results.push({ 
      index: i, 
      url: url, 
      ocrText: ocrText.slice(0, 200), 
      culprits, 
      ownPresent,
      hasText: ocrText.length > 5,
      pass: !found // Individual image pass only cares about NOT having foreign brand
    });

    if (found) {
      console.log(`  \x1b[31m  ❌ Image[${i}] OCR detected foreign brand(s): ${culprits.join(", ")}\x1b[0m`);
    } else if (isMissingBrand) {
      console.log(`  \x1b[33m  ⚠️ Image[${i}] OCR missing own brand "${ownBrand}" (Regenerate recommended)\x1b[0m`);
    } else {
      console.log(`  \x1b[32m  ✅ Image[${i}] OCR clean and contains own brand\x1b[0m`);
    }
  }

  const containsForeign = results.some(r => !r.pass);
  
  // Did we find text anywhere?
  const anyTextExists = results.some(r => r.hasText);
  // Did we find the own brand anywhere?
  const ownBrandFoundAnywhere = results.some(r => r.ownPresent);
  
  // Overall pass: No foreign brands. 
  // We NO LONGER fail if ownBrand is missing across all images, because 
  // manufacturer-level brands (like L'Oreal) rarely appear on sub-brand bottles (like Biolage).
  let pass = !containsForeign;

  if (anyTextExists && !ownBrandFoundAnywhere) {
    // Log a warning but do not fail the upload
    console.warn(`\x1b[33m  ⚠️  OCR Warning: Brand "${ownBrand}" not found on any image, but no competitors detected either. Allowing upload.\x1b[0m`);
  }

  return { pass, results, ocrMethod };
}

/**
 * Validate OCR text for variant images.
 * Assumes you pass the OCR text of the generated variant image.
 */
export function validateVariantOcrText(ocrText, variantPackSize) {
  if (!ocrText) return false;
  const lower = ocrText.toLowerCase();
  
  if (variantPackSize === 2) return lower.includes("упаковка") || lower.includes("2 шт");
  if (variantPackSize === 3) return lower.includes("упаковка") || lower.includes("3 шт");
  if (variantPackSize === 4) return lower.includes("упаковка") || lower.includes("4 шт");
  
  return true;
}

/** Check if a module is importable (for dynamic feature detection) */
async function isTestable(moduleName) {
  try { await import(moduleName); return true; } catch { return false; }
}

/**
 * Quick heuristic-only image brand check (no OCR network call).
 * Use this when Google Vision is not configured and you want a fast pre-check.
 *
 * @param {string[]} imageUrls
 * @param {string}   ownBrand
 * @returns {{ pass: boolean, flagged: number[] }}
 */
export function quickImageHeuristicCheck(imageUrls, ownBrand) {
  const flagged = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const text = ocrViaUrlHeuristic(imageUrls[i]);
    const { found } = scanOcrTextForBrands(text, ownBrand);
    if (found) flagged.push(i);
  }
  return { pass: flagged.length === 0, flagged };
}
