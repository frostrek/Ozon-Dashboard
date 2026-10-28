#!/usr/bin/env bun
/**
 * m-image-gen-ru.js
 * Ozon-optimised Russian SEO image generation.
 *
 * Features:
 *  1. generateMainImageText(product, brandName, benefitsRu[])
 *     Returns structured text data for the MAIN image overlay.
 *
 *  2. generateBenefitsRu(product, typeLabel)
 *     Uses Groq AI to produce 4-5 short Russian benefit lines for the main image.
 *
 *  3. selectBackground(categoryLabel)
 *     Returns a background style descriptor keyed to the product category.
 *
 *  4. translateImageText(imageTextEn, product)
 *     Translates additional-image (img 2,3,4…) overlay text EN→RU using Groq.
 *     Preserves layout, colours, icons — only replaces language.
 *
 * NOTE: Actual pixel-level image compositing is NOT done in this module.
 *       This module produces the TEXT content + layout metadata that your
 *       image-compositing layer (Canvas / Sharp / external service) consumes.
 *       If you want canvas-based compositing wire in the `canvas` npm package.
 */

const GROQ_API_KEY = Bun.env.GROQ_API_KEY;
const GROQ_MODEL   = "llama-3.1-8b-instant";

// ── Background style map ──────────────────────────────────────────────────────
const BACKGROUND_STYLE_MAP = {
  // Hair care
  "hair": "hair_care_herbal_green",
  "hair oil": "hair_care_herbal_green",
  "hair care": "hair_care_herbal_green",
  "shampoo": "hair_care_fresh_blue",
  "conditioner": "hair_care_fresh_blue",
  "hair mask": "hair_care_herbal_green",
  "hair serum": "hair_care_fresh_blue",

  // Skin care
  "skin": "skincare_cosmetic_beige",
  "skin care": "skincare_cosmetic_beige",
  "cream": "skincare_cosmetic_beige",
  "face wash": "skincare_cosmetic_beige",
  "serum": "skincare_cosmetic_gold",
  "moisturizer": "skincare_cosmetic_beige",
  "sunscreen": "skincare_bright_white",
  "body lotion": "skincare_cosmetic_beige",
  "scrub": "skincare_cosmetic_beige",

  // Ayurveda / Herbal
  "ayurveda": "ayurveda_herbal_earthy",
  "ayurvedic": "ayurveda_herbal_earthy",
  "herbal": "ayurveda_herbal_earthy",
  "oil": "ayurveda_herbal_earthy",

  // Homeopathy
  "homeopathy": "homeopathy_wellness_white",
  "homeopathic": "homeopathy_wellness_white",
  "homoeopathy": "homeopathy_wellness_white",

  // Supplements
  "supplement": "health_supplement_clean",
  "capsule": "health_supplement_clean",
  "tablet": "health_supplement_clean",
  "vitamin": "health_supplement_clean",
  "protein": "health_supplement_clean",

  // Food / Spices / Coffee
  "coffee": "coffee_premium_beans",
  "кофе": "coffee_premium_beans",
  "spice": "food_spice_vibrant",
  "masala": "food_spice_vibrant",
  "food": "food_natural_warm",
  "snack": "food_natural_warm",
};

/**
 * Select background style based on product category / type label.
 * @param {string} categoryLabel - Ozon type label or product category string
 * @returns {string} background style key
 */
export function selectBackground(categoryLabel) {
  if (!categoryLabel) return "cosmetic_clean_white";
  const lower = categoryLabel.toLowerCase();
  for (const [keyword, style] of Object.entries(BACKGROUND_STYLE_MAP)) {
    if (lower.includes(keyword)) return style;
  }
  return "cosmetic_clean_white"; // default
}

// ── Groq helper ───────────────────────────────────────────────────────────────
async function callGroq(systemPrompt, userPrompt, maxTokens = 500) {
  if (!GROQ_API_KEY) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: maxTokens
      }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ── Benefit lines generator ───────────────────────────────────────────────────
const FALLBACK_BENEFITS = {
  "hair": [
    "✓ Стимулирует рост волос",
    "✓ Питает кожу головы",
    "✓ Для ежедневного ухода",
    "✓ Натуральный состав",
    "✓ Подходит для всех типов волос"
  ],
  "skin": [
    "✓ Глубокое увлажнение кожи",
    "✓ Выравнивает тон кожи",
    "✓ Натуральные ингредиенты",
    "✓ Подходит для чувствительной кожи",
    "✓ Нежная формула без агрессивных компонентов"
  ],
  "coffee": [
    "✓ Насыщенный вкус",
    "✓ Аромат свежей обжарки",
    "✓ Натуральные кофейные зерна",
    "✓ Бодрящий эффект",
    "✓ Высокое качество"
  ],
  "ayurveda": [
    "✓ Аюрведическая формула",
    "✓ Натуральные растительные экстракты",
    "✓ Традиционный рецепт",
    "✓ Holistический уход",
    "✓ Без вредных химикатов"
  ],
  "homeopathy": [
    "✓ Гомеопатический состав",
    "✓ Мягкое натуральное действие",
    "✓ Подходит для всей семьи",
    "✓ Не вызывает привыкания",
    "✓ Традиционная формула"
  ],
  "supplement": [
    "✓ Поддерживает здоровье",
    "✓ Натуральные ингредиенты",
    "✓ Легко усваивается",
    "✓ Для ежедневного приёма",
    "✓ Без искусственных добавок"
  ],
  "default": [
    "✓ Высокое качество",
    "✓ Натуральный состав",
    "✓ Для ежедневного использования",
    "✓ Проверенная формула",
    "✓ Безопасно и эффективно"
  ]
};

function getFallbackBenefits(categoryLabel) {
  const lower = (categoryLabel || "").toLowerCase();
  if (lower.includes("coffee") || lower.includes("кофе")) return FALLBACK_BENEFITS.coffee;
  if (lower.includes("hair")) return FALLBACK_BENEFITS.hair;
  if (lower.includes("skin") || lower.includes("cream") || lower.includes("face")) return FALLBACK_BENEFITS.skin;
  if (lower.includes("ayurved") || lower.includes("herbal")) return FALLBACK_BENEFITS.ayurveda;
  if (lower.includes("homeo")) return FALLBACK_BENEFITS.homeopathy;
  if (lower.includes("supplement") || lower.includes("capsule") || lower.includes("vitamin")) return FALLBACK_BENEFITS.supplement;
  return FALLBACK_BENEFITS.default;
}

/**
 * Generate 4-5 short Russian benefit lines for the main image left panel.
 * @param {object} product     - raw product object
 * @param {string} typeLabel   - Ozon type / category label
 * @returns {Promise<string[]>} array of 4-5 benefit strings
 */
export async function generateBenefitsRu(product, typeLabel = "") {
  const systemPrompt = `You are an Ozon marketplace image copywriter.
Generate EXACTLY 5 short product benefits in Russian for a product image overlay.
RULES:
1. Each line starts with "✓ " (checkmark + space).
2. Each benefit is 2-6 words maximum.
3. In pure Russian Cyrillic (brand stays Latin if needed).
4. No hashtags, no promotional language, no prices, no URLs, no phone numbers, no QR code references.
5. Do NOT include any marketplace violating text or watermarks.
6. If the product is COFFEE, extract exact physical traits instead of generic marketing:
   - Bean type (e.g., "100% Арабика" or "Арабика и Робуста")
   - Roast level (e.g., "Темная обжарка" or "Средняя обжарка")
   - Grind (e.g., "Крупный помол" or "В зернах")
   - Flavor notes (e.g., "Шоколад, Карамель", "Ягоды, Орехи")
   - Yield (e.g., "Хватит на 70 чашек") ONLY if available
7. Return ONLY the 5 lines, one per line. No numbering, no JSON.`;

  const userPrompt = `Product: ${product.name}
Brand: ${product.brand || "N/A"}
Category: ${product.product_category || typeLabel || "N/A"}
Description/Specs: ${(product.description || "").slice(0, 400)}
Key Features: ${(product.feature_bullets || []).slice(0, 4).join(" | ")}`;

  const raw = await callGroq(systemPrompt, userPrompt, 300);
  if (!raw) return getFallbackBenefits(typeLabel);

  const lines = raw
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 3)
    .slice(0, 5);

  // Ensure each line starts with ✓
  const benefits = lines.map(l => l.startsWith("✓") ? l : `✓ ${l}`);

  return benefits.length >= 4 ? benefits : getFallbackBenefits(typeLabel);
}

/**
 * Build the structured main-image text layout object.
 * @param {object} product     - raw product
 * @param {string} brandName   - resolved brand name (e.g. "Khadi Natural")
 * @param {string[]} benefitsRu - array of 4-5 Russian benefit lines
 * @param {string} titleRu     - short Russian product title for image
 * @param {string} typeLabel   - Ozon category / type label
 * @returns {object} mainImageLayout
 */
export function buildMainImageLayout(product, brandName, benefitsRu, titleRu, typeLabel) {
  return {
    background: selectBackground(typeLabel || product.product_category || ""),
    top: {
      brandName: brandName || product.brand || "",
      titleRu: (titleRu || product.name || "").slice(0, 60)
    },
    leftPanel: {
      benefits: benefitsRu.slice(0, 5)
    },
    productFocus: {
      primaryImage: (Array.isArray(product.image_urls) ? product.image_urls[0] : null) || null
    },
    meta: {
      asin: product.asin,
      category: typeLabel || product.product_category || ""
    }
  };
}

/**
 * Translate additional image overlay text (image 2, 3, 4…) from English → Russian.
 * Preserves layout descriptors; only translates string values.
 *
 * @param {string|object} imageTextOrObj  - English text/object from image overlay
 * @param {object} product                - raw product (for context)
 * @returns {Promise<string|object>}      - Russian version
 */
export async function translateImageText(imageTextOrObj, product) {
  // If it's an object, serialise for translation then deserialise
  const isObj = typeof imageTextOrObj === "object" && imageTextOrObj !== null;
  const inputText = isObj ? JSON.stringify(imageTextOrObj) : String(imageTextOrObj || "");

  const systemPrompt = `You are a professional EN→RU translator for Ozon product images.
RULES:
1. Translate ALL English text strings to natural Russian.
2. Keep layout keys / JSON structure EXACTLY the same.
3. Keep brand names in their original Latin form.
4. Keep numbers, units (ml, g, mg, %), measurements as-is.
5. Do NOT add hashtags, promotional words, or extra content.
6. Return ONLY the translated content — no explanation.`;

  const userPrompt = `Product Brand: ${product.brand || "N/A"}
Translate the following image text/object EN→RU:
${inputText}`;

  const raw = await callGroq(systemPrompt, userPrompt, 600);
  if (!raw) return imageTextOrObj; // fallback: return original if AI fails

  if (isObj) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

/**
 * Convenience: generate the full Russian main-image data package for a product.
 * Call this BEFORE image compositing.
 *
 * @param {object} product   - raw product
 * @param {object} brand     - resolved brand { id, value }
 * @param {string} titleRu   - Russian SEO title already generated
 * @param {string} typeLabel - Ozon type label
 * @returns {Promise<object>} - { layout, benefits, background }
 */
export async function generateRussianImagePackage(product, brand, titleRu, typeLabel) {
  console.log(`  🖼️  Generating Russian image package for ASIN ${product.asin}...`);
  const benefits = await generateBenefitsRu(product, typeLabel);
  const layout   = buildMainImageLayout(product, brand.value, benefits, titleRu, typeLabel);

  console.log(`  📋 Image layout: bg="${layout.background}", benefits=${benefits.length}`);
  return { layout, benefits, background: layout.background };
}
