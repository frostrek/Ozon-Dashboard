import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

export async function GET(req) {
    try {
        const _lo = await prisma.$queryRawUnsafe(`
            SELECT * FROM ListingOptimization
            ORDER BY CASE WHEN priority='CRITICAL' THEN 1 WHEN priority='HIGH' THEN 2 WHEN priority='MEDIUM' THEN 3 ELSE 4 END ASC, problem_count DESC
            LIMIT 200
        `);

        if (!_lo || _lo.length === 0) return NextResponse.json([]);

        const productIds = _lo.map(r => r.product_id).map(id => `'${id}'`).join(',');

        const [products, workflows, seos, identities] = await Promise.all([
            prisma.$queryRawUnsafe(`SELECT * FROM Product WHERE id IN (${productIds})`),
            prisma.$queryRawUnsafe(`SELECT * FROM ProductWorkflow WHERE product_id IN (${productIds})`),
            prisma.$queryRawUnsafe(`SELECT * FROM SEOAnalysis WHERE product_id IN (${productIds})`),
            prisma.$queryRawUnsafe(`SELECT * FROM ProductIdentity WHERE product_id IN (${productIds})`)
        ]);

        const pMap = products.reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
        const wMap = workflows.reduce((acc, r) => { acc[r.product_id] = r; return acc; }, {});
        const sMap = seos.reduce((acc, r) => { acc[r.product_id] = r; return acc; }, {});
        const idMap = identities.reduce((acc, r) => { acc[r.product_id] = r; return acc; }, {});

        const combined = _lo.map(lo => {
            const p  = pMap[lo.product_id] || {};
            const w  = wMap[lo.product_id] || {};
            const s  = sMap[lo.product_id] || {};
            const id = idMap[lo.product_id] || {};

            return {
                lo_id: lo.id,
                ...lo,
                
                // Product fields
                product_name: p.name,
                product_brand: p.brand,
                product_sku: p.sku,
                product_price: p.price,
                product_stock: p.stock,
                product_sales: p.sales,
                product_images: p.images_json,
                product_account_id: p.account_id,
                product_rating: p.rating,
                product_reviews: p.reviews_count,

                // Workflow fields
                amazon_status: w.amazon_status,
                amazon_completed_at: w.amazon_completed_at,
                amazon_confidence: w.amazon_confidence,
                amazon_asin: w.amazon_asin,
                amazon_price: w.amazon_price,
                amazon_rating: w.amazon_rating,
                amazon_reviews: w.amazon_reviews,
                compliance_status: w.compliance_status,
                compliance_completed_at: w.compliance_completed_at,
                compliance_flags: w.compliance_flags,
                groq_seo_status: w.groq_seo_status,
                groq_seo_completed_at: w.groq_seo_completed_at,
                groq_suggested_title: w.groq_suggested_title,
                groq_keywords: w.groq_keywords,
                listing_opt_status: w.listing_opt_status,
                listing_opt_completed_at: w.listing_opt_completed_at,
                competitor_status: w.competitor_status,
                competitor_completed_at: w.competitor_completed_at,
                competitor_min_price: w.competitor_min_price,
                competitor_max_price: w.competitor_max_price,
                competitor_avg_price: w.competitor_avg_price,
                buybox_price: w.buybox_price,
                cost_calc_status: w.cost_calc_status,
                cost_calc_completed_at: w.cost_calc_completed_at,
                landed_cost: w.landed_cost,
                suggested_price: w.suggested_price,
                expected_margin: w.expected_margin,
                expected_profit: w.expected_profit,
                roi: w.roi,

                // SEO fields
                seo_score_total: s.score_total,
                seo_russian_keywords: s.score_russian_keywords,
                seo_missing_keywords: s.score_missing_keywords,
                seo_attribute_complete: s.score_attribute_complete,
                seo_image_quality: s.score_image_quality,
                seo_title_quality: s.score_title_quality,
                seo_description_quality: s.score_description_quality,
                seo_content_rating: s.score_content_rating,
                seo_brand: s.score_brand,
                seo_review_count: s.score_review_count,
                seo_rating: s.score_rating,
                seo_visibility: s.score_visibility,
                russian_kw_found: s.russian_kw_found,
                russian_kw_missing: s.russian_kw_missing,
                seo_missing_attrs: s.missing_attributes,
                seo_image_count: s.image_count,
                seo_title_word_count: s.title_word_count,
                seo_desc_char_count: s.description_char_count,
                has_live_conversion: s.has_live_conversion,
                seo_updated_at: s.updated_at,

                // Identity fields
                identity_client_id: id.client_id,
                identity_offer_id: id.offer_id,
                identity_sku: id.sku,
                identity_barcode: id.barcode,
                identity_last_sync_at: id.last_sync_at
            };
        });

        return NextResponse.json(combined);
    } catch (err) {
        console.error('[Listing Opt API]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req) {
    try {
        const { id, status } = await req.json();
        const t = new Date().toISOString();
        await prisma.$executeRawUnsafe(`
            UPDATE ListingOptimization
            SET approval_status='${status}', updated_at='${t}'
            WHERE id='${id}'
        `);
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
