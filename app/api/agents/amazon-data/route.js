import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const prisma = new PrismaClient();
const AGENT_NAME = 'AMAZON_DATA';

const BANNED_TERMS = ['лечит', 'вылечивает', 'устраняет', 'инфекция', 'заболевание', 'cure', 'treats', 'heals'];

function passesCompliance(text) {
    if (!text) return true;
    return !BANNED_TERMS.some(bt => text.toLowerCase().includes(bt));
}

function safeStr(val) {
    if (!val) return '';
    return String(val).replace(/'/g, "''").replace(/[\n\r]/g, ' ');
}

async function insertTask(p, fields) {
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(`
        INSERT INTO AgentTask 
        (id, account_id, product_id, agent_name, severity, status, risk_level,
         what_is_wrong, why_is_wrong, suggested_value, expected_benefit,
         safe_to_auto, compliance_passed, created_at, updated_at, field_name, before_value, after_value)
        VALUES 
        ('${fields.id}', ${p.account_id ? `'${p.account_id}'` : 'NULL'}, '${p.id}',
         '${AGENT_NAME}', '${fields.severity}', 'PENDING', '${fields.risk_level}',
         '${safeStr(fields.what)}', '${safeStr(fields.why)}',
         '${safeStr(fields.suggested)}', '${safeStr(fields.benefit)}',
         ${fields.safe_auto}, 1, '${now}', '${now}',
         '${fields.field}', '${safeStr(fields.before)}', '${safeStr(fields.after)}')
    `);
}

export async function POST(req) {
    try {
        const body = await req.json();
        const limit = body.limit || 100;
        const accountId = body.accountId;

        console.log(`[${AGENT_NAME}] Starting scan (limit: ${limit})...`);

        const products = await prisma.product.findMany({
            where: { ...(accountId ? { account_id: accountId } : {}) },
            include: { ai_analysis: true },
            take: limit,
            orderBy: { content_rating: 'asc' } // Worst first
        });

        const runId = crypto.randomUUID();
        await prisma.$executeRawUnsafe(`
            INSERT INTO AgentRun (id, agent_name, status, products_scanned, started_at) 
            VALUES ('${runId}', '${AGENT_NAME}', 'RUNNING', ${products.length}, '${new Date().toISOString()}')
        `);

        let totalTasks = 0;
        let productsWithFindings = 0;
        const summary = {
            missing_brand: 0, missing_images: 0, missing_weight: 0,
            missing_country: 0, poor_title: 0, amazon_attr: 0
        };

        for (const p of products) {
            let foundTask = false;
            let amazonData = {};
            let currentAttrs = {};

            try {
                if (p.ai_analysis?.amazon_data_json) amazonData = JSON.parse(p.ai_analysis.amazon_data_json);
                if (p.attributes_json) currentAttrs = JSON.parse(p.attributes_json);
            } catch (e) { /* skip bad JSON */ }

            // ── PRIORITY CHECK 1: Missing Brand ─────────────────────────────────────
            if (!p.brand || p.brand.trim() === '') {
                await insertTask(p, {
                    id: crypto.randomUUID(), severity: 'HIGH', risk_level: 'MODERATE',
                    what: 'Missing Brand attribute on Ozon listing',
                    why: 'Brand is mandatory on Ozon. Missing brand reduces search discoverability and buyer trust.',
                    suggested: 'Extract brand from product title or sync from Amazon catalog.',
                    benefit: '+15% Conversion, Improves Ozon Search Rank',
                    safe_auto: 0, field: 'brand', before: '', after: ''
                });
                totalTasks++; foundTask = true; summary.missing_brand++;
            }

            // ── PRIORITY CHECK 2: Insufficient Images ────────────────────────────────
            let imageCount = 0;
            try { const imgs = JSON.parse(p.images_json || '[]'); imageCount = Array.isArray(imgs) ? imgs.length : 0; } catch (e) { }
            if (imageCount < 2) {
                await insertTask(p, {
                    id: crypto.randomUUID(), severity: 'HIGH', risk_level: 'LOW',
                    what: `Only ${imageCount} image(s) — Ozon recommends 6+`,
                    why: 'Ozon content rating scoring penalises listings with fewer than 3 images.',
                    suggested: 'Add: Main Product, Ingredient View, Benefits Infographic, Usage Instructions, Side Angle',
                    benefit: '+20% Content Rating, +15% Click-through Rate',
                    safe_auto: 0, field: 'images', before: String(imageCount), after: '6'
                });
                totalTasks++; foundTask = true; summary.missing_images++;
            }

            // ── PRIORITY CHECK 3: Missing Weight ─────────────────────────────────────
            const hasWeight = currentAttrs.weight || currentAttrs['Вес'] || p.volume_weight;
            if (!hasWeight) {
                const amzW = amazonData.weight || amazonData.item_weight || '';
                await insertTask(p, {
                    id: crypto.randomUUID(), severity: 'MODERATE', risk_level: 'LOW',
                    what: 'Missing Weight attribute in Ozon listing',
                    why: 'Weight is required for Ozon shipping calculations and attribute completeness score.',
                    suggested: amzW ? `Amazon value: ${amzW}` : 'Add product weight in grams (e.g. 250g)',
                    benefit: 'Attribute Completeness +10%, Correct Shipping Cost',
                    safe_auto: amzW ? 1 : 0, field: 'weight', before: '', after: safeStr(amzW)
                });
                totalTasks++; foundTask = true; summary.missing_weight++;
            }

            // ── PRIORITY CHECK 4: Missing Country of Origin ──────────────────────────
            const hasCountry = currentAttrs.country_of_origin || currentAttrs['Страна происхождения'];
            if (!hasCountry) {
                const amzC = amazonData.country_of_origin || '';
                await insertTask(p, {
                    id: crypto.randomUUID(), severity: 'MODERATE', risk_level: 'LOW',
                    what: 'Missing Country of Origin attribute',
                    why: 'Country of Origin is required for customs compliance and the Ozon attribute score.',
                    suggested: amzC ? `Amazon value: ${amzC}` : 'Add country of manufacture (e.g. India)',
                    benefit: 'Compliance Score +5%, Attribute Completeness',
                    safe_auto: amzC ? 1 : 0, field: 'country_of_origin', before: '', after: safeStr(amzC)
                });
                totalTasks++; foundTask = true; summary.missing_country++;
            }

            // ── PRIORITY CHECK 5: Amazon Cross-Reference Attributes ──────────────────
            const amzCrossChecks = [
                { amzKey: 'ingredients', label: 'Ingredients', ozonKey: 'ingredients' },
                { amzKey: 'form', label: 'Product Form', ozonKey: 'form' },
                { amzKey: 'color', label: 'Color', ozonKey: 'color' },
            ];
            for (const ch of amzCrossChecks) {
                const amzVal = amazonData[ch.amzKey];
                const currVal = currentAttrs[ch.ozonKey];
                if (amzVal && !currVal && passesCompliance(amzVal)) {
                    await insertTask(p, {
                        id: crypto.randomUUID(), severity: 'MODERATE', risk_level: 'LOW',
                        what: `Missing ${ch.label} — found in Amazon data`,
                        why: `Amazon listing has "${ch.label}" attribute. After compliance check, this should be migrated to Ozon.`,
                        suggested: safeStr(amzVal),
                        benefit: 'Attribute Completeness Boost, Cross-Platform Data Sync',
                        safe_auto: 1, field: ch.ozonKey, before: '', after: safeStr(amzVal)
                    });
                    totalTasks++; foundTask = true; summary.amazon_attr++;
                }
            }

            // ── PRIORITY CHECK 6: Title Missing or Too Short ─────────────────────────
            if (!p.name || p.name.length < 20) {
                await insertTask(p, {
                    id: crypto.randomUUID(), severity: 'HIGH', risk_level: 'MODERATE',
                    what: 'Product title is missing or too short for Ozon',
                    why: 'Ozon requires a descriptive title for indexing. Short titles reduce search visibility and content score.',
                    suggested: 'Route through Ozon SEO Generator — create Russian-language title with keywords. Never copy Amazon title directly.',
                    benefit: '+25% Search Visibility, Content Rating Improvement',
                    safe_auto: 0, field: 'name', before: safeStr(p.name || ''), after: ''
                });
                totalTasks++; foundTask = true; summary.poor_title++;
            }

            if (foundTask) productsWithFindings++;
        }

        await prisma.$executeRawUnsafe(`
            UPDATE AgentRun 
            SET status = 'COMPLETE', tasks_created = ${totalTasks}, completed_at = '${new Date().toISOString()}'
            WHERE id = '${runId}'
        `);

        return NextResponse.json({
            success: true,
            run_id: runId,
            products_scanned: products.length,
            tasks_created: totalTasks,
            products_with_findings: productsWithFindings,
            findings_breakdown: summary,
            compliance_enforced: true,
            auto_push: false // Phase 2: Prepare Fix, NOT Auto Push
        });

    } catch (err) {
        console.error(`[${AGENT_NAME}] Error:`, err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
