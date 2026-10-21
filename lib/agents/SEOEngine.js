import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Russian keyword dictionary per category ──────────────────────────────────
const RUSSIAN_KEYWORDS = {
    'Hair Care':        ['шампунь','волосы','кондиционер','маска','уход','укрепление','рост','против перхоти','питание','блеск'],
    'Skin Care':        ['крем','уход','увлажнение','кожа','сыворотка','тонер','антивозрастной','от морщин','SPF','солнцезащитный'],
    'Personal Care':    ['мыло','гель','лосьон','дезодорант','тело','очищение','антибактериальный'],
    'Ayurvedic Products': ['аюрведа','травяной','натуральный','органический','растительный','экстракт'],
    'Health Supplements': ['витамин','добавка','капсула','иммунитет','здоровье','омега','коллаген'],
    'Perfume & Fragrance': ['духи','парфюм','аромат','туалетная вода','мужской','женский','унисекс'],
    'Food & Spices':    ['специи','натуральный','органический','без ГМО','чай','пряности'],
    'General Products': ['натуральный','качество','оригинал','производство','Индия'],
};

const MANDATORY_ATTRIBUTES = [
    'weight', 'volume', 'country_of_origin', 'ingredients',
    'product_form', 'brand', 'manufacturer'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function countImages(imagesJson) {
    try {
        const parsed = JSON.parse(imagesJson || '[]');
        let count = 0;
        const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'string' && v.startsWith('http')) count++; };
        walk(parsed);
        return count;
    } catch { return 0; }
}

function inferCategory(brand = '', name = '') {
    const t = (brand + ' ' + name).toLowerCase();
    if (/shampoo|hair|oil|conditioner/.test(t)) return 'Hair Care';
    if (/face|cream|skin|serum|moistur/.test(t)) return 'Skin Care';
    if (/supplement|tablet|capsule|vitamin/.test(t)) return 'Health Supplements';
    if (/perfume|attar|fragrance|deodorant/.test(t)) return 'Perfume & Fragrance';
    if (/soap|wash|cleanser|hand|body/.test(t)) return 'Personal Care';
    if (/ayurveda|herbal|organic/.test(t)) return 'Ayurvedic Products';
    return 'General Products';
}

function getRussianKeywords(title, category) {
    const categoryKws = RUSSIAN_KEYWORDS[category] || RUSSIAN_KEYWORDS['General Products'];
    const found = [], missing = [];
    const titleLower = (title || '').toLowerCase();
    for (const kw of categoryKws) {
        if (titleLower.includes(kw)) found.push(kw);
        else missing.push(kw);
    }
    return { found, missing };
}

function getAttributeCompleteness(attrsJson) {
    let attrs = {};
    try { attrs = JSON.parse(attrsJson || '{}'); } catch {}
    const keys = Object.keys(attrs).map(k => k.toLowerCase());
    const missing = MANDATORY_ATTRIBUTES.filter(a => !keys.some(k => k.includes(a)));
    return { count: keys.length, missing, present: MANDATORY_ATTRIBUTES.filter(a => keys.some(k => k.includes(a))) };
}

function scoreTitle(title) {
    if (!title) return { score: 0, wordCount: 0, issues: ['No title'] };
    const len = title.length;
    const wordCount = title.split(/\s+/).filter(Boolean).length;
    const hasRussian = /[а-яА-ЯёЁ]/.test(title);
    let score = 100;
    const issues = [];
    if (len < 30) { score -= 40; issues.push('Title critically short'); }
    else if (len < 60) { score -= 20; issues.push('Title below optimal length'); }
    else if (len > 200) { score -= 10; issues.push('Title may be truncated in search'); }
    if (!hasRussian) { score -= 35; issues.push('No Russian keywords in title'); }
    if (wordCount < 5) { score -= 15; issues.push('Too few keywords'); }
    return { score: Math.max(0, score), wordCount, issues };
}

function scoreDescription(product) {
    // Description is stored in attributes_json or products lack description field
    let desc = '';
    try {
        const attrs = JSON.parse(product.attributes_json || '{}');
        desc = attrs.description || attrs.Описание || attrs.desc || '';
    } catch {}
    const charCount = desc.length;
    if (charCount === 0) return { score: 0, charCount, issues: ['No description'] };
    if (charCount < 200) return { score: 20, charCount, issues: ['Description too short'] };
    if (charCount < 500) return { score: 55, charCount, issues: ['Description below optimal'] };
    return { score: 90, charCount, issues: [] };
}

// ─── Main SEO Engine ──────────────────────────────────────────────────────────
export class SEOEngine {
    /**
     * Analyze a product and produce a structured 16-dimension SEO breakdown.
     * Never invents revenue data — marks live-data flags accurately.
     */
    async analyze(product, amazonRef = null, competitorData = null) {
        const category = product.category_name || inferCategory(product.brand, product.name);
        const imgCount = countImages(product.images_json);
        const { found: rwFound, missing: rwMissing } = getRussianKeywords(product.name, category);
        const { count: attrCount, missing: missingAttrs } = getAttributeCompleteness(product.attributes_json);
        const titleAnalysis = scoreTitle(product.name);
        const descAnalysis  = scoreDescription(product);

        // ── Per-dimension scores (0–100) ───────────────────────────────────
        const scores = {
            russian_keywords:   rwFound.length > 0 ? Math.round((rwFound.length / (rwFound.length + rwMissing.length)) * 100) : 0,
            missing_keywords:   rwMissing.length === 0 ? 100 : Math.round(Math.max(0, 100 - rwMissing.length * 15)),
            competitor_overlap: competitorData ? 65 : 0,   // 0 = no live competitor kw data yet
            category_coverage:  attrCount >= 5 ? 85 : Math.round((attrCount / 5) * 85),
            attribute_complete: missingAttrs.length === 0 ? 100 : Math.round(Math.max(0, 100 - missingAttrs.length * 14)),
            brand:              (product.brand && product.brand.trim()) ? 100 : 0,
            variant:            product.is_variant ? 90 : 50,
            content_rating:     Math.min(100, Math.round(product.content_rating || 0)),
            image_quality:      imgCount >= 6 ? 100 : imgCount >= 3 ? 70 : imgCount >= 1 ? 35 : 0,
            title_quality:      titleAnalysis.score,
            description_quality: descAnalysis.score,
            review_count:       product.reviews_count > 50 ? 100 : Math.round((product.reviews_count || 0) / 50 * 100),
            rating:             product.rating ? Math.round((product.rating / 5) * 100) : 0,
            visibility:         product.content_rating >= 80 ? 100 : Math.round((product.content_rating || 0) * 1.2),
        };

        // Weighted composite (sum of weights must equal 100)
        const weights = {
            russian_keywords: 12, missing_keywords: 8, competitor_overlap: 5,
            category_coverage: 6, attribute_complete: 10, brand: 5, variant: 3,
            content_rating: 15, image_quality: 12, title_quality: 12,
            description_quality: 7, review_count: 2, rating: 1, visibility: 2
        };
        const scoreTotal = Math.round(
            Object.entries(weights).reduce((total, [k, w]) => total + (scores[k] || 0) * (w / 100), 0)
        );

        // ── Live data flags ────────────────────────────────────────────────
        const hasLiveSales       = (product.sales || 0) > 0;
        const hasLiveImpressions = false; // Not available until Ozon Analytics API connected
        const hasLiveConversion  = false; // Will require Ozon Analytics API

        // ── Persist to SEOAnalysis ─────────────────────────────────────────
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const safeStr = (v) => (v ? String(v).replace(/'/g, "''").substring(0, 500) : '');

        await prisma.$executeRawUnsafe(`
            INSERT INTO SEOAnalysis (
                id, product_id,
                score_total, score_russian_keywords, score_missing_keywords,
                score_competitor_overlap, score_category_coverage, score_attribute_complete,
                score_brand, score_variant, score_content_rating, score_image_quality,
                score_title_quality, score_description_quality, score_review_count,
                score_rating, score_visibility,
                russian_kw_found, russian_kw_missing, title_word_count,
                description_char_count, image_count, attribute_count, missing_attributes,
                has_live_sales, has_live_impressions, has_live_conversion,
                created_at, updated_at
            ) VALUES (
                '${id}', '${product.id}',
                ${scoreTotal},
                ${scores.russian_keywords}, ${scores.missing_keywords},
                ${scores.competitor_overlap}, ${scores.category_coverage}, ${scores.attribute_complete},
                ${scores.brand}, ${scores.variant}, ${scores.content_rating}, ${scores.image_quality},
                ${scores.title_quality}, ${scores.description_quality}, ${scores.review_count},
                ${scores.rating}, ${scores.visibility},
                '${safeStr(JSON.stringify(rwFound))}', '${safeStr(JSON.stringify(rwMissing))}',
                ${titleAnalysis.wordCount}, ${descAnalysis.charCount},
                ${imgCount}, ${attrCount}, '${safeStr(JSON.stringify(missingAttrs))}',
                ${hasLiveSales ? 1 : 0}, ${hasLiveImpressions ? 1 : 0}, ${hasLiveConversion ? 1 : 0},
                '${now}', '${now}'
            )
            ON CONFLICT(product_id) DO UPDATE SET
                score_total=${scoreTotal},
                score_russian_keywords=${scores.russian_keywords},
                score_missing_keywords=${scores.missing_keywords},
                score_attribute_complete=${scores.attribute_complete},
                score_image_quality=${scores.image_quality},
                score_title_quality=${scores.title_quality},
                score_description_quality=${scores.description_quality},
                score_content_rating=${scores.content_rating},
                russian_kw_found='${safeStr(JSON.stringify(rwFound))}',
                russian_kw_missing='${safeStr(JSON.stringify(rwMissing))}',
                missing_attributes='${safeStr(JSON.stringify(missingAttrs))}',
                image_count=${imgCount}, title_word_count=${titleAnalysis.wordCount},
                description_char_count=${descAnalysis.charCount},
                has_live_sales=${hasLiveSales ? 1 : 0},
                updated_at='${now}'
        `);

        return {
            scoreTotal, scores,
            rwFound, rwMissing, missingAttrs,
            titleAnalysis, descAnalysis,
            imgCount, attrCount,
            hasLiveSales, hasLiveImpressions, hasLiveConversion,
            category
        };
    }
}
