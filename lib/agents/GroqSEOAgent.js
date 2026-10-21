/**
 * GroqSEOAgent.js
 * 
 * Agent #3 — AI-powered SEO generation and scoring using Groq LLM.
 * 
 * Responsibilities:
 *   - Generate optimized Russian title (if compliance passed)
 *   - Identify missing Russian/category keywords
 *   - Score listing across 14 SEO dimensions
 *   - Write to SEOAnalysis table
 *   - Learn from rejected titles (never re-suggest rejected content)
 */

import { PrismaClient } from '@prisma/client';
import Groq             from 'groq-sdk';
import { writeMemory }  from '../engine/WorkflowEngine.js';

const prisma = new PrismaClient();
const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Category → Russian keyword banks
const RUSSIAN_KEYWORD_BANKS = {
    'Уход за лицом':  ['очищающий', 'увлажняющий', 'антивозрастной', 'тонус', 'сияние', 'питательный', 'натуральный', 'органический', 'гипоаллергенный', 'для кожи'],
    'Шампунь':        ['укрепляющий', 'питательный', 'для роста волос', 'против перхоти', 'натуральный', 'без сульфатов', 'объём', 'блеск', 'увлажняющий'],
    'Сыворотка':      ['концентрированный', 'антивозрастной', 'восстанавливающий', 'витамин С', 'ретинол', 'гиалуроновая кислота', 'осветляющий'],
    'Масло':          ['натуральное', 'холодного отжима', 'питательное', 'восстанавливающее', 'аромат', 'для массажа', 'эфирное'],
    'Маска':          ['питательная', 'увлажняющая', 'восстанавливающая', 'для лица', 'для волос', 'очищающая', 'детокс'],
    'Крем':           ['увлажняющий', 'питательный', 'защитный', 'антивозрастной', 'SPF', 'для рук', 'для тела', 'для лица'],
    'Гель':           ['очищающий', 'освежающий', 'увлажняющий', 'успокаивающий', 'антибактериальный'],
    'DEFAULT':        ['натуральный', 'органический', 'высококачественный', 'эффективный', 'безопасный'],
};

function detectCategory(product) {
    const name = (product.name || '').toLowerCase();
    const cat  = (product.category_name || '').toLowerCase();
    for (const key of Object.keys(RUSSIAN_KEYWORD_BANKS)) {
        if (key === 'DEFAULT') continue;
        if (name.includes(key.toLowerCase()) || cat.includes(key.toLowerCase())) return key;
    }
    return 'DEFAULT';
}

function findRussianKeywords(text, bank) {
    if (!text) return { found: [], missing: [] };
    const textLower = text.toLowerCase();
    const found   = bank.filter(kw => textLower.includes(kw.toLowerCase()));
    const missing = bank.filter(kw => !textLower.includes(kw.toLowerCase()));
    return { found, missing };
}

function scoreTitle(title = '') {
    const words = title.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 10) return 100;
    if (words.length >= 7)  return 80;
    if (words.length >= 5)  return 60;
    if (words.length >= 3)  return 40;
    return 20;
}

function scoreDescription(desc = '') {
    const chars = desc.trim().length;
    if (chars >= 800) return 100;
    if (chars >= 400) return 75;
    if (chars >= 200) return 50;
    if (chars >= 50)  return 25;
    return 0;
}

export async function GroqSEOAgent({ product_id, workflow_id, memory }) {
    const product = await prisma.product.findUnique({ where: { id: product_id } });
    if (!product) throw new Error(`Product ${product_id} not found`);

    // Load compliance result from memory
    const compliancePassed = memory['passed'] !== 'false';
    const rejectedTitles   = memory['rejected_title'] ? [memory['rejected_title']] : [];

    // ─── Russian Keyword Analysis ─────────────────────────────────────────────
    const category   = detectCategory(product);
    const bank       = RUSSIAN_KEYWORD_BANKS[category] || RUSSIAN_KEYWORD_BANKS['DEFAULT'];
    const kwAnalysis = findRussianKeywords(product.name, bank);

    // ─── Image Count ──────────────────────────────────────────────────────────
    let imageCount = 0;
    try {
        const imgs = JSON.parse(product.images_json || '[]');
        imageCount = Array.isArray(imgs) ? imgs.flat().filter(Boolean).length : 0;
    } catch {}

    // ─── Attribute Completeness ───────────────────────────────────────────────
    let attrCount = 0;
    let missingAttrs = [];
    try {
        const attrs = JSON.parse(product.attributes_json || '[]');
        attrCount = Array.isArray(attrs) ? attrs.length : 0;
        if (attrCount < 5) missingAttrs = ['Цвет', 'Страна происхождения', 'Состав', 'Объём', 'Срок годности'].slice(0, 5 - attrCount);
    } catch {}

    // ─── Groq SEO Title Generation (only if compliance passed) ───────────────
    let suggestedTitle  = null;
    let groqKeywords    = [];
    let groqConfidence  = 0;

    if (compliancePassed && product.name) {
        let start = Date.now();
        try {
            const settings = await prisma.aISettings.findUnique({ where: { id: 'GLOBAL' } }).catch(() => null);
            const model    = settings?.groq_model || 'llama3-70b-8192';

            const prompt = `
You are an expert Ozon marketplace SEO specialist for Indian beauty/healthcare products sold in Russia.

Product: ${product.name}
Brand: ${product.brand || 'Unknown'}
Category: ${product.category_name || 'General'}
Current Price: ${ product.price ? `₽${product.price}` : 'Unknown'}
${rejectedTitles.length > 0 ? `REJECTED TITLES (do not use): ${rejectedTitles.join('; ')}` : ''}

Task: Generate ONE optimized Russian product title for Ozon marketplace.
Rules:
- Maximum 200 characters
- Must include brand name
- Must include key product benefit in Russian
- Must include size/quantity if known
- Do NOT make medical claims (лечит, терапия, диагностика)
- Do NOT repeat the rejected titles above
- Return ONLY the title, nothing else
`.trim();

            const chat = await groq.chat.completions.create({
                model,
                messages:    [{ role: 'user', content: prompt }],
                max_tokens:  200,
                temperature: 0.3,
            });

            suggestedTitle = chat.choices[0]?.message?.content?.trim() || null;
            groqConfidence = 85;

            // Extract keywords from the title
            if (suggestedTitle) {
                groqKeywords = suggestedTitle.split(/\s+/)
                    .filter(w => w.length > 4)
                    .slice(0, 10);
                
                // ─── Phase 5: Groq SEO Versioning ──────────────────────────────────────
                const versionData = {
                    prompt,
                    groq_model: model,
                    tokens: chat.usage?.total_tokens || 0,
                    generation_time_ms: Date.now() - (start || Date.now()),
                    russian_title: suggestedTitle,
                    russian_keywords: groqKeywords,
                    seo_score: scoreTitle(suggestedTitle)
                };
                await writeMemory(product_id, 'GROQ_SEO', `title_version_${Date.now()}`, JSON.stringify(versionData), 'SEO_VERSIONING');
            }
        } catch (err) {
            // Groq failure is non-fatal — pipeline continues
            console.warn('[GroqSEO] Groq API failed:', err.message);
        }
    }

    // ─── Score Calculation ────────────────────────────────────────────────────
    const russianKwScore    = Math.round((kwAnalysis.found.length / Math.max(bank.length, 1)) * 100);
    const titleScore        = scoreTitle(product.name);
    const imageScore        = Math.min(100, Math.round((imageCount / 5) * 100));
    const attrScore         = Math.min(100, Math.round((attrCount / 8) * 100));
    const contentRating     = Math.round((product.content_rating || 0));
    const reviewScore       = Math.min(100, Math.round(((product.reviews_count || 0) / 50) * 100));
    const ratingScore       = product.rating ? Math.round((product.rating / 5) * 100) : 0;
    const brandScore        = product.brand ? 100 : 0;
    const descScore         = 0; // No raw description in product — use 0

    // Weighted total (weights must sum to ~100)
    const total = Math.round(
        russianKwScore   * 0.12 +
        titleScore       * 0.12 +
        imageScore       * 0.12 +
        contentRating    * 0.15 +
        attrScore        * 0.10 +
        brandScore       * 0.05 +
        reviewScore      * 0.02 +
        ratingScore      * 0.02 +
        descScore        * 0.07
    );

    // ─── Persist to SEOAnalysis ───────────────────────────────────────────────
    const now = new Date().toISOString();
    const seoRow = {
        score_total:               total,
        score_russian_keywords:    russianKwScore,
        score_missing_keywords:    100 - russianKwScore,
        score_image_quality:       imageScore,
        score_title_quality:       titleScore,
        score_description_quality: descScore,
        score_content_rating:      contentRating,
        score_attribute_complete:  attrScore,
        score_brand:               brandScore,
        score_review_count:        reviewScore,
        score_rating:              ratingScore,
        score_visibility:          0,
        russian_kw_found:          JSON.stringify(kwAnalysis.found),
        russian_kw_missing:        JSON.stringify(kwAnalysis.missing),
        missing_attributes:        JSON.stringify(missingAttrs),
        image_count:               imageCount,
        attribute_count:           attrCount,
        has_live_sales:            0,
        has_live_impressions:      0,
        has_live_conversion:       0,
        updated_at:                now,
    };

    // Upsert via raw SQL (table not Prisma-managed)
    const existing = await prisma.$queryRawUnsafe(`SELECT id FROM SEOAnalysis WHERE product_id='${product_id}'`);
    if (existing.length > 0) {
        const setClause = Object.entries(seoRow)
            .map(([k,v]) => `"${k}"=${v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g,"''")}'` : v}`)
            .join(', ');
        await prisma.$executeRawUnsafe(`UPDATE SEOAnalysis SET ${setClause} WHERE product_id='${product_id}'`);
    }

    // Persist Groq suggestions to ProductWorkflow
    if (suggestedTitle || groqKeywords.length > 0) {
        await prisma.$executeRawUnsafe(`
            UPDATE ProductWorkflow
            SET groq_seo_status='COMPLETE',
                groq_seo_completed_at='${now}',
                groq_suggested_title='${(suggestedTitle || '').replace(/'/g,"''")}',
                groq_keywords='${JSON.stringify(groqKeywords).replace(/'/g,"''")}'
            WHERE product_id='${product_id}'
        `);
    } else {
        await prisma.$executeRawUnsafe(`
            UPDATE ProductWorkflow
            SET groq_seo_status='COMPLETE', groq_seo_completed_at='${now}'
            WHERE product_id='${product_id}'
        `);
    }

    // ─── Memory: track SEO score history ─────────────────────────────────────
    await writeMemory(product_id, 'GROQ_SEO', 'last_seo_score', String(total),        'HISTORICAL_SEO');
    await writeMemory(product_id, 'GROQ_SEO', 'last_russian_kw_score', String(russianKwScore), 'HISTORICAL_SEO');

    // ─── Phase 5: Agent Decision Object ──────────────────────────────────────
    const decisionObject = {
        workflow_id,
        product_id,
        account: product.account_id || 'UNKNOWN',
        agent: 'GROQ_SEO',
        problem_detected: kwAnalysis.missing.length > 0 || titleScore < 80 
            ? 'Missing Critical Russian Keywords' 
            : 'Suboptimal Title Length / Density',
        why_detected: `Only ${kwAnalysis.found.length} category keywords found in title. Title scored ${titleScore}/100.`,
        evidence: JSON.stringify({ missing: kwAnalysis.missing, current_title: product.name }),
        current_value: product.name,
        suggested_value: suggestedTitle || product.name,
        confidence: groqConfidence,
        expected_benefit: `Improve SEO rank in "${category}" category on Ozon RU`,
        business_impact: 'Increased organic impressions and CTR',
        data_source: 'Groq + Local SEO Matrix',
        last_updated: now,
        requires_approval: true
    };

    return decisionObject;
}
