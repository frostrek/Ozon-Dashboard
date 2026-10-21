import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { SEOEngine } from './SEOEngine.js';
import { ListingOptimizationAgent } from './ListingOptimizationAgent.js';

const prisma = new PrismaClient();
const seoEngine  = new SEOEngine();
const listingOpt = new ListingOptimizationAgent();

const safeStr = (v) => v ? String(v).replace(/'/g, "''").substring(0, 500) : '';
const now = () => new Date().toISOString();

// ── DB helpers ────────────────────────────────────────────────────────────────
async function upsertWorkflow(productId, patch) {
    const id = crypto.randomUUID();
    const current = now();
    const setClauses = Object.entries(patch)
        .map(([k, v]) => {
            const val = v === null ? 'NULL' : typeof v === 'number' ? v : `'${safeStr(String(v))}'`;
            return `"${k}"=${val}`;
        })
        .join(', ');

    await prisma.$executeRawUnsafe(`
        INSERT INTO ProductWorkflow (id, product_id, created_at, updated_at)
        VALUES ('${id}', '${productId}', '${current}', '${current}')
        ON CONFLICT(product_id) DO UPDATE SET ${setClauses}, updated_at='${current}'
    `);
}

// ─── Agent 1: Amazon Cross-Reference (real data from AmazonReference table) ──
async function runAmazonAgent(product) {
    await upsertWorkflow(product.id, { amazon_status: 'RUNNING' });

    try {
        const ref = await prisma.$queryRawUnsafe(`
            SELECT * FROM AmazonReference WHERE product_id = '${product.id}' LIMIT 1
        `);
        const amazon = ref[0] || null;

        if (amazon) {
            await upsertWorkflow(product.id, {
                amazon_status: 'COMPLETE',
                amazon_completed_at: now(),
                amazon_confidence: amazon.match_confidence || 0,
                amazon_asin: amazon.asin || '',
                amazon_price: amazon.selling_price || 0,
                amazon_rating: amazon.rating || 0,
                amazon_reviews: amazon.review_count || 0,
            });
            return { status: 'COMPLETE', data: amazon };
        } else {
            await upsertWorkflow(product.id, { amazon_status: 'PENDING', amazon_completed_at: null });
            return { status: 'PENDING', data: null };
        }
    } catch (e) {
        await upsertWorkflow(product.id, { amazon_status: 'FAILED' });
        return { status: 'FAILED', data: null };
    }
}

// ─── Agent 2: Compliance audit (leverages existing AgentTask records) ─────────
async function runComplianceAgent(product) {
    await upsertWorkflow(product.id, { compliance_status: 'RUNNING' });

    const MEDICAL_PATTERNS = /от простуды|лечит|устраняет|против болезни|cure|treats|heals|от рака|от диабета|от гипертонии/i;
    const flags = [];
    if (MEDICAL_PATTERNS.test(product.name || '')) {
        flags.push({ field: 'title', issue: 'Medical/disease claim detected', risk: 'HIGH' });
    }
    // Pull existing compliance tasks from AgentTask
    const existingFlags = await prisma.$queryRawUnsafe(`
        SELECT what_is_wrong, severity FROM AgentTask
        WHERE product_id='${product.id}' AND agent_name='COMPLIANCE_AGENT' AND status='PENDING' LIMIT 5
    `);
    for (const f of existingFlags) {
        flags.push({ field: 'compliance', issue: f.what_is_wrong, risk: f.severity });
    }

    await upsertWorkflow(product.id, {
        compliance_status: 'COMPLETE',
        compliance_completed_at: now(),
        compliance_flags: JSON.stringify(flags),
    });
    return { status: 'COMPLETE', flags };
}

// ─── Agent 3: SEO Analysis (comprehensive 14-dimension engine) ────────────────
async function runSEOAgent(product, amazonData) {
    await upsertWorkflow(product.id, { groq_seo_status: 'RUNNING' });

    const result = await seoEngine.analyze(product, amazonData);
    const topMissing = result.rwMissing.slice(0, 5);

    await upsertWorkflow(product.id, {
        groq_seo_status: 'COMPLETE',
        groq_seo_completed_at: now(),
        groq_suggested_title: '', // Will be populated when Groq API available
        groq_keywords: JSON.stringify(topMissing),
    });
    return { status: 'COMPLETE', seoData: result };
}

// ─── Agent 4: Listing Optimization ───────────────────────────────────────────
async function runListingOptAgent(product, seoData) {
    await upsertWorkflow(product.id, { listing_opt_status: 'RUNNING' });

    const result = await listingOpt.run(product);
    await upsertWorkflow(product.id, {
        listing_opt_status: result.status === 'ALREADY_OPTIMIZED' ? 'SKIPPED' : 'COMPLETE',
        listing_opt_completed_at: now(),
    });
    return { status: result.status, result };
}

// ─── Agent 5: Competitor Pricing ─────────────────────────────────────────────
async function runCompetitorAgent(product) {
    await upsertWorkflow(product.id, { competitor_status: 'RUNNING' });

    const row = await prisma.$queryRawUnsafe(`
        SELECT * FROM CompetitorData WHERE product_id='${product.id}' LIMIT 1
    `).catch(() => []);
    const comp = row[0] || null;

    if (comp) {
        await upsertWorkflow(product.id, {
            competitor_status: 'COMPLETE',
            competitor_completed_at: now(),
            competitor_min_price: comp.min_price || 0,
            competitor_max_price: comp.max_price || 0,
            competitor_avg_price: comp.avg_price || 0,
            buybox_price: comp.buybox_price || 0,
        });
    } else {
        await upsertWorkflow(product.id, { competitor_status: 'PENDING' });
    }
    return { status: comp ? 'COMPLETE' : 'PENDING', data: comp };
}

// ─── Agent 6: Cost Calculator ─────────────────────────────────────────────────
async function runCostCalc(product, amazonData, competitorData) {
    await upsertWorkflow(product.id, { cost_calc_status: 'RUNNING' });

    const amazonPrice = amazonData?.selling_price || null;
    if (!amazonPrice) {
        await upsertWorkflow(product.id, { cost_calc_status: 'PENDING' });
        return { status: 'PENDING' };
    }

    const buyPrice    = amazonPrice * 0.6;
    const shipping    = buyPrice * 0.12;
    const importDuty  = buyPrice * 0.20;
    const myIndiaExp  = 1.5;
    const landedCost  = buyPrice + shipping + importDuty + myIndiaExp;
    const ozonComm    = (product.price || landedCost * 2.5) * 0.18;
    const settle      = 0.5;
    const totalCost   = landedCost + ozonComm + settle;
    const sellPrice   = product.price || landedCost * 2.5;
    const profit      = sellPrice - totalCost;
    const margin      = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;
    const roi         = landedCost > 0 ? (profit / landedCost) * 100 : 0;

    await upsertWorkflow(product.id, {
        cost_calc_status: 'COMPLETE',
        cost_calc_completed_at: now(),
        landed_cost: landedCost,
        suggested_price: Math.ceil(landedCost * 2.5),
        expected_margin: margin,
        expected_profit: profit,
        roi,
    });
    return { status: 'COMPLETE', landedCost, profit, margin, roi };
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────
export class ProductWorkflowOrchestrator {
    async runProduct(product) {
        console.log(`[Workflow] Starting ${product.id} — ${product.name?.slice(0, 40)}`);

        // 1. Amazon Cross Reference
        const amazonResult     = await runAmazonAgent(product);
        // 2. Compliance
        const complianceResult = await runComplianceAgent(product);
        // 3. SEO Analysis (uses amazon context if available)
        const seoResult        = await runSEOAgent(product, amazonResult.data);
        // 4. Listing Optimization (uses SEO score)
        const listingResult    = await runListingOptAgent(product, seoResult.seoData);
        // 5. Competitor Pricing
        const compResult       = await runCompetitorAgent(product);
        // 6. Cost Calculator (requires amazon price)
        const costResult       = await runCostCalc(product, amazonResult.data, compResult.data);

        console.log(`[Workflow] Done ${product.id} | SEO=${seoResult.seoData?.scoreTotal} | Priority=${listingResult.result?.priority}`);

        return {
            amazon:     amazonResult,
            compliance: complianceResult,
            seo:        seoResult,
            listing:    listingResult,
            competitor: compResult,
            cost:       costResult,
        };
    }

    async runBatch(limit = 500) {
        const products = await prisma.product.findMany({
            take: limit,
            select: {
                id: true, name: true, brand: true, sku: true, price: true, stock: true,
                sales: true, content_rating: true, images_json: true, attributes_json: true,
                account_id: true, category_name: true, reviews_count: true, rating: true,
                is_variant: true
            }
        });

        let done = 0;
        for (const p of products) {
            await this.runProduct(p);
            done++;
            if (done % 50 === 0) console.log(`  [Batch] ${done}/${products.length} complete`);
        }
        return done;
    }
}
