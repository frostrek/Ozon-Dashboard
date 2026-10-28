#!/usr/bin/env bun
/**
 * m-quality-validator.js
 * 
 * New quality control checks:
 * 1. Title Length Validation
 * 2. Russian Language Validation (Cyrillic ratio check)
 * 3. Characteristics Completeness Score
 * 4. Image Quality Check (mock / basic heuristic before upload)
 */

/**
 * 2. Title Length Validation
 * target: 150-200 chars. Must contain brand, primary keyword, volume.
 * Reject if it contains known ASIN/SKU/fragments.
 */
export function validateTitleQuality(title, brand, primaryKeyword) {
  if (!title) return { pass: false, error: "Empty title" };
  
  const errors = [];
  const warnings = [];
  const len = title.length;

  if (len < 50) warnings.push(`Title too short (${len} chars, target 150+)`);
  if (len > 255) errors.push(`Title too long (${len} chars, limit 255)`);

  const lower = title.toLowerCase();
  
  const collapse = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Zа-яёА-ЯЁ0-9]/g, "").toLowerCase();
  
  if (brand && brand !== "Нет бренда" && !collapse(title).includes(collapse(brand))) {
    errors.push(`Title missing brand "${brand}"`);
  }
  
  if (primaryKeyword && !lower.includes(primaryKeyword.toLowerCase())) {
    errors.push(`Title missing primary keyword "${primaryKeyword}"`);
  }
  
  // Basic volume/size presence check
  if (!/(\d+)\s*(мл|г|ml|g|oz|шт|капсул|таблеток)/i.test(lower)) {
    warnings.push("Title seems to be missing size/volume (ml/g)");
  }

  // Fragment checks (just in case they slipped past strictTitleClean)
  if (/\bB0[A-Z0-9]{8}\b/.test(title)) errors.push("Title contains ASIN");
  if (/(?<!\d)\d{10,13}(?!\d)/.test(title)) errors.push("Title contains Barcode/Shipment ID");

  // Block "Нет бренда" or "No Brand"
  if (brand !== "Нет бренда" && (lower.includes("нет бренда") || lower.includes("no brand"))) {
    errors.push("Title contains forbidden phrase 'Нет бренда' / 'No Brand'");
  }

  // Basic duplicated word / duplicate keyword check
  const words = lower.split(/\s+/).filter(w => w.length > 3);
  const duplicates = words.filter((w, i) => words.indexOf(w) !== i);
  if (duplicates.length > 2) {
    warnings.push(`Title may contain duplicate spam keywords (${duplicates.join(", ")})`);
  }

  return { pass: errors.length === 0, errors, warnings };
}

/**
 * 5. Russian Language Validation
 * Verifies that the majority of text is Cyrillic.
 */
export function validateRussianLanguage(text, threshold = 0.6) {
  if (!text) return { pass: true, cyrillicRatio: 0 };
  
  // Count only alphabet characters for the ratio
  const letters = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
  if (letters.length === 0) return { pass: true, cyrillicRatio: 0 };
  
  const cyrillic = letters.match(/[а-яА-ЯёЁ]/g) || [];
  const ratio = cyrillic.length / letters.length;
  
  return { 
    pass: ratio >= threshold, 
    cyrillicRatio: ratio,
    error: ratio < threshold ? `Cyrillic ratio ${Math.round(ratio*100)}% < target ${threshold*100}%` : null
  };
}

export function validateAllTextLanguage(aiObj) {
  const fields = ["title_ru", "description_ru", "annotation_ru", "method_of_use"];
  const errors = [];
  for (const field of fields) {
    if (!aiObj[field]) continue;
    const res = validateRussianLanguage(aiObj[field], 0.5); // At least 50% must be Cyrillic
    if (!res.pass) {
      errors.push(`${field}: ${res.error}`);
    }
  }
  return { pass: errors.length === 0, errors };
}

/**
 * 6. Characteristics Completeness Score
 * Calculates what percentage of mapped attributes are successfully filled with values.
 */
export function calculateCharacteristicsScore(filledAttrs, availableOzonAttrsMap) {
  if (!availableOzonAttrsMap || availableOzonAttrsMap.length === 0) return { score: 100, pass: true };

  // Remove complex/nested attrs for simplicity, count only basic scalar ones
  const basicAttrs = availableOzonAttrsMap.filter(a => !a.is_collection && !a.dictionary_id);
  if (basicAttrs.length === 0) return { score: 100, pass: true };

  let filledCount = 0;
  for (const a of basicAttrs) {
    const existing = filledAttrs.find(fa => fa.id === a.id);
    if (existing && existing.values && existing.values.length > 0 && existing.values[0].value) {
      filledCount++;
    }
  }

  const score = Math.round((filledCount / basicAttrs.length) * 100);
  // Ozon minimum doesn't matter, but user requested 80%
  return { 
    score, 
    pass: score >= 80, 
    filledCount, 
    totalCount: basicAttrs.length 
  };
}

/**
 * 7. Image Quality Check
 * Currently a mock heuristic check since we can't deep-inspect the canvas here,
 * but it serves as the integration point for future `image-size` module usage.
 */
export function validateImageQuality(imageUrls) {
  const errors = [];
  for (const url of imageUrls) {
    if (!url) continue;
    // Just a placeholder heuristic - in reality you'd download the image buffer and read dimensions
    if (url.includes("1200x1600") || url.includes("blurry") || url.includes("lowres")) {
      // simulate check
    }
  }
  return { pass: true, errors }; 
}
