/**
 * POST /api/agents/nightly-seo
 * Agent #1 — Nightly SEO Agent
 * Scans all products, finds weak listings, creates AgentTask rows.
 * Priority: Low Content Rating → Missing Attributes → Missing Images → 
 *           Missing Russian SEO → Missing Color/Shade → Missing Weight/Volume
 */
import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const AGENT_NAME = 'NIGHTLY_SEO';

// Ozon-known brand names that must NEVER be translated
const PROTECTED_BRANDS = [
    'maybelline', 'lakme', 'himalaya', 'khadi', 'mamaearth',
    'tata sampann', 'vedaka', 'biotique', 'dabur', 'patanjali',
    'lotus herbals', 'khadi natural', 'vicco', 'nykaa', 'loreal',
    'garnier', 'nivea', 'pond', 'dove', 'vaseline'
];

// Phrases that must NEVER appear in AI-generated titles
const BANNED_PHRASES = [
    '100% original', 'best seller', 'top quality', 'premium product',
    'buy now', 'best price', 'frostreck', 'sunrise luxury', 'herbal boutique',
    'contact', 'http', 'www.', '@', 'whatsapp', 'call us'
];

// Medical/drug claims banned from descriptions
const BANNED_CLAIMS = [
    'treats', 'cures', 'removes disease', 'guaranteed results',
    'anti-acne', 'anti-aging', 'whitening', 'disease prevention', 'drug'
];

function generateId() {
    return randomUUID();
}

function analyzeProduct(p) {
    const tasks = [];
    let attrs = {};
    let images = [];
    try { attrs = JSON.parse(p.attributes_json || '{}'); } catch(e) {}
    try { images = JSON.parse(p.images_json || '[]'); } catch(e) {}

    const brand = (p.brand || '').toLowerCase();
    const title = p.name || '';
    const titleWithoutBrand = brand 
        ? title.replace(new RegExp(brand, 'i'), '').trim()
        : title;
    const hasRussianType = /[а-яА-Я]{3,}/.test(titleWithoutBrand);
    const desc = attrs?.description || attrs?.annotation || '';
    const contentRating = p.content_rating || 0;
    const imgCount = Array.isArray(images) ? images.length : 0;

    // ── PRIORITY 1: Very Low Content Rating ─────────────────────────────────
    if (contentRating < 60 && contentRating > 0) {
        tasks.push({
            severity: contentRating < 30 ? 'CRITICAL' : 'HIGH',
            what_is_wrong: `Content Rating is critically low: ${contentRating}%`,
            why_is_wrong: 'Low content rating directly reduces search visibility on Ozon. Products below 60% are penalized in search ranking.',
            suggested_value: 'Requires: Russian Description + Attributes + Images',
            expected_benefit: `+${Math.round((80 - contentRating))}% Content Rating, Higher Search Visibility`,
            field_name: 'content_rating',
            before_value: String(contentRating),
            after_value: '80+',
            safe_to_auto: false,
            risk_level: 'HIGH'
        });
    }

    // ── PRIORITY 2: Missing Russian Product Type in Title ───────────────────
    if (!hasRussianType) {
        tasks.push({
            severity: 'CRITICAL',
            what_is_wrong: 'Title has no Russian product type — listing is invisible on Ozon search',
            why_is_wrong: 'Ozon search algorithms require the product type in Russian. English-only titles do not rank for Russian buyer searches.',
            suggested_value: `${p.brand || 'Brand'} [Тип продукта на русском], [Свойство], [Вес/Объём]`,
            expected_benefit: '+20-35% Search Visibility, Improved Category Ranking',
            field_name: 'name',
            before_value: title,
            after_value: 'Needs AI rewrite using Ozon formula',
            safe_to_auto: false,
            risk_level: 'HIGH'
        });
    }

    // ── PRIORITY 3: Missing Critical Attributes ──────────────────────────────
    const attrKeys = Object.keys(attrs).filter(k => !['description','annotation','keywords'].includes(k));
    if (attrKeys.length < 5) {
        const missing = [];
        if (!attrs.Цвет && !attrs.color) missing.push('Цвет (Color)');
        if (!attrs.Вес && !attrs.weight && !attrs['Вес нетто']) missing.push('Вес (Weight)');
        if (!attrs.Объём && !attrs.volume) missing.push('Объём (Volume)');
        if (!attrs['Страна производитель'] && !attrs.country) missing.push('Страна производитель');
        if (!attrs['Тип кожи'] && !attrs['Тип волос']) missing.push('Тип кожи/волос');

        if (missing.length > 0) {
            tasks.push({
                severity: 'HIGH',
                what_is_wrong: `Missing ${missing.length} critical Ozon attributes`,
                why_is_wrong: 'Missing attributes reduce content rating and prevent category filtering. Buyers cannot find the product in filtered searches.',
                suggested_value: `Add: ${missing.join(', ')}`,
                expected_benefit: `+${missing.length * 5}% Content Rating, Better Filter Visibility`,
                field_name: 'attributes_json',
                before_value: `${attrKeys.length} attributes filled`,
                after_value: `${attrKeys.length + missing.length} attributes filled`,
                safe_to_auto: false,
                risk_level: 'LOW'
            });
        }
    }

    // ── PRIORITY 4: Missing Images ──────────────────────────────────────────
    if (imgCount < 3) {
        tasks.push({
            severity: imgCount === 0 ? 'CRITICAL' : 'HIGH',
            what_is_wrong: `Only ${imgCount} image(s) — Ozon recommends 6+`,
            why_is_wrong: 'Listings with fewer than 3 images receive lower content ratings and significantly lower click-through rates.',
            suggested_value: 'Add: Main Product, Ingredient View, Benefits Infographic, Usage Instructions, Side Angle',
            expected_benefit: `+${(6 - imgCount) * 4}% Content Rating, +15% Click-through Rate`,
            field_name: 'images_json',
            before_value: `${imgCount} images`,
            after_value: '6+ images',
            safe_to_auto: false,
            risk_level: 'LOW'
        });
    }

    // ── PRIORITY 5: Missing Russian Keywords ────────────────────────────────
    const keywords = attrs?.keywords || attrs?.hashtags || '';
    if (!keywords || keywords.length < 20 || !/[а-яА-Я]/.test(keywords)) {
        tasks.push({
            severity: 'MODERATE',
            what_is_wrong: 'Missing or insufficient Russian SEO keywords',
            why_is_wrong: 'Ozon search uses keywords to index product discovery. Missing keywords means buyers using Russian search queries will not find this listing.',
            suggested_value: 'Generate 5-10 Russian long-tail keywords using Groq AI',
            expected_benefit: '+10-15% Search Discovery',
            field_name: 'keywords',
            before_value: keywords || '(empty)',
            after_value: 'AI-generated Russian keywords',
            safe_to_auto: true,
            risk_level: 'LOW'
        });
    }

    // ── PRIORITY 6: Missing Color / Shade ───────────────────────────────────
    const isBoldCategory = /Foundation|Lipstick|Concealer|Primer|Mascara|тон|крем|губная/i.test(p.category_name || '');
    if (isBoldCategory && !attrs.Цвет && !attrs.color && !attrs['Оттенок']) {
        tasks.push({
            severity: 'HIGH',
            what_is_wrong: 'Cosmetic product missing Color / Shade attribute',
            why_is_wrong: 'Makeup products require shade data for Ozon variant grouping and filter compliance. Missing shade blocks variant linking.',
            suggested_value: 'Extract shade from product title (e.g., "126 Light Pecan") and map to Ozon Color attribute',
            expected_benefit: '+10% Content Rating, Enables Variant Grouping',
            field_name: 'color_shade',
            before_value: '(missing)',
            after_value: 'Real shade from product data',
            safe_to_auto: false,
            risk_level: 'HIGH'
        });
    }

    // ── PRIORITY 6b: Missing Weight / Volume for Food ───────────────────────
    const isFoodCategory = /Tea|Coffee|Spice|Seed|Sampann|Vedaka|Dabur|масло|чай/i.test(p.category_name || '');
    if (isFoodCategory && !attrs.Вес && !attrs['Вес нетто'] && !attrs.weight) {
        tasks.push({
            severity: 'HIGH',
            what_is_wrong: 'Food product missing mandatory Weight attribute',
            why_is_wrong: 'Ozon requires weight for all food category products. Missing weight blocks the listing from passing content rating checks.',
            suggested_value: 'Extract weight from product title (e.g. "200 г") and set Вес нетто attribute',
            expected_benefit: '+8% Content Rating, Passes Ozon Validation',
            field_name: 'weight',
            before_value: '(missing)',
            after_value: 'Extracted from title or Amazon data',
            safe_to_auto: true,
            risk_level: 'LOW'
        });
    }

    // ── Compliance check: Banned phrases ────────────────────────────────────
    const titleLower = title.toLowerCase();
    const foundBanned = BANNED_PHRASES.filter(b => titleLower.includes(b));
    if (foundBanned.length > 0) {
        tasks.push({
            severity: 'CRITICAL',
            what_is_wrong: `Title contains banned phrases: "${foundBanned.join('", "')}"`,
            why_is_wrong: 'Ozon moderators reject listings with marketing spam, seller names, or contact details in titles. This can cause listing removal.',
            suggested_value: 'Remove banned phrases and replace with product-specific descriptors',
            expected_benefit: 'Prevents listing rejection / account moderation',
            field_name: 'name',
            before_value: title,
            after_value: 'Clean title without banned phrases',
            safe_to_auto: false,
            risk_level: 'HIGH'
        });
    }

    return tasks;
}

export async function POST(req) {
    const runId = generateId();
    const startTime = new Date();

    try {
        const body = await req.json().catch(() => ({}));
        const { accountId, limit = 500 } = body;

        // Create AgentRun log
        await prisma.$executeRawUnsafe(`
            INSERT INTO AgentRun (id, agent_name, status, started_at)
            VALUES ('${runId}', '${AGENT_NAME}', 'RUNNING', '${startTime.toISOString()}')
        `);

        // Fetch products — prioritize by content_rating ASC (weakest first)
        const where = { status: 'ACTIVE' };
        if (accountId) where.account_id = accountId;

        const products = await prisma.product.findMany({
            where,
            select: {
                id: true, sku: true, name: true, brand: true, price: true,
                category_name: true, images_json: true, attributes_json: true,
                content_rating: true, status: true, account_id: true
            },
            orderBy: { content_rating: 'asc' },
            take: limit
        });

        let totalTasksCreated = 0;
        const taskInserts = [];

        for (const product of products) {
            const productTasks = analyzeProduct(product);
            for (const task of productTasks) {
                const taskId = generateId();
                taskInserts.push({
                    id: taskId,
                    account_id: product.account_id,
                    product_id: product.id,
                    agent_name: AGENT_NAME,
                    severity: task.severity,
                    status: 'PENDING',
                    risk_level: task.risk_level || 'LOW',
                    what_is_wrong: task.what_is_wrong.replace(/'/g, "''"),
                    why_is_wrong: (task.why_is_wrong || '').replace(/'/g, "''"),
                    suggested_value: (task.suggested_value || '').replace(/'/g, "''"),
                    expected_benefit: (task.expected_benefit || '').replace(/'/g, "''"),
                    safe_to_auto: task.safe_to_auto ? 1 : 0,
                    field_name: task.field_name || '',
                    before_value: (task.before_value || '').replace(/'/g, "''"),
                    after_value: (task.after_value || '').replace(/'/g, "''"),
                    compliance_passed: 0,
                    compliance_note: ''
                });
                totalTasksCreated++;
            }
        }

        // Batch insert tasks (SQLite doesn't support bulk insert simply, do in chunks)
        for (const t of taskInserts) {
            try {
                await prisma.$executeRawUnsafe(`
                    INSERT INTO AgentTask 
                    (id, account_id, product_id, agent_name, severity, status, risk_level,
                     what_is_wrong, why_is_wrong, suggested_value, expected_benefit,
                     safe_to_auto, field_name, before_value, after_value, compliance_passed, compliance_note, created_at, updated_at)
                    VALUES 
                    ('${t.id}', ${t.account_id ? `'${t.account_id}'` : 'NULL'}, '${t.product_id}',
                     '${t.agent_name}', '${t.severity}', '${t.status}', '${t.risk_level}',
                     '${t.what_is_wrong}', '${t.why_is_wrong}', '${t.suggested_value}', '${t.expected_benefit}',
                     ${t.safe_to_auto}, '${t.field_name}', '${t.before_value}', '${t.after_value}',
                     ${t.compliance_passed}, '${t.compliance_note}', '${new Date().toISOString()}', '${new Date().toISOString()}')
                `);
            } catch (err) {
                console.error('INSERT SQL ERROR:', err.message);
                throw err;
            }
        }

        // Update AgentRun as complete
        const endTime = new Date();
        await prisma.$executeRawUnsafe(`
            UPDATE AgentRun SET
                status = 'COMPLETE',
                products_scanned = ${products.length},
                tasks_created = ${totalTasksCreated},
                completed_at = '${endTime.toISOString()}'
            WHERE id = '${runId}'
        `);

        return NextResponse.json({
            success: true,
            run_id: runId,
            products_scanned: products.length,
            tasks_created: totalTasksCreated,
            duration_ms: endTime - startTime
        });

    } catch (err) {
        console.error('[NIGHTLY_SEO Agent Error]', err.message);
        await prisma.$executeRawUnsafe(`
            UPDATE AgentRun SET status = 'FAILED', error_message = '${err.message.replace(/'/g,"''")}', completed_at = '${new Date().toISOString()}'
            WHERE id = '${runId}'
        `).catch(() => {});
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
