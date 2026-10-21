import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // ── 1. ProductWorkflow: tracks agent pipeline per product ─────────────
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductWorkflow" (
            "id"                    TEXT PRIMARY KEY,
            "product_id"            TEXT UNIQUE NOT NULL,

            -- Agent statuses: PENDING | RUNNING | COMPLETE | FAILED | SKIPPED
            "amazon_status"         TEXT DEFAULT 'PENDING',
            "amazon_completed_at"   TEXT,
            "amazon_confidence"     INTEGER,
            "amazon_asin"           TEXT,
            "amazon_price"          REAL,
            "amazon_rating"         REAL,
            "amazon_reviews"        INTEGER,

            "compliance_status"     TEXT DEFAULT 'PENDING',
            "compliance_completed_at" TEXT,
            "compliance_flags"      TEXT,  -- JSON array of issues

            "groq_seo_status"       TEXT DEFAULT 'PENDING',
            "groq_seo_completed_at" TEXT,
            "groq_suggested_title"  TEXT,
            "groq_keywords"         TEXT,  -- JSON array

            "listing_opt_status"    TEXT DEFAULT 'PENDING',
            "listing_opt_completed_at" TEXT,

            "competitor_status"     TEXT DEFAULT 'PENDING',
            "competitor_completed_at" TEXT,
            "competitor_min_price"  REAL,
            "competitor_max_price"  REAL,
            "competitor_avg_price"  REAL,
            "buybox_price"          REAL,

            "cost_calc_status"      TEXT DEFAULT 'PENDING',
            "cost_calc_completed_at" TEXT,
            "landed_cost"           REAL,
            "suggested_price"       REAL,
            "expected_margin"       REAL,
            "expected_profit"       REAL,
            "roi"                   REAL,

            "approval_status"       TEXT DEFAULT 'PENDING',
            "approved_at"           TEXT,
            "approved_by"           TEXT,

            "created_at"            TEXT DEFAULT (datetime('now')),
            "updated_at"            TEXT DEFAULT (datetime('now'))
        )
    `);
    console.log('✓ ProductWorkflow table OK');

    // ── 2. SEO Analysis table ─────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SEOAnalysis" (
            "id"                        TEXT PRIMARY KEY,
            "product_id"                TEXT UNIQUE NOT NULL,

            -- Score breakdown (each 0–100)
            "score_total"               REAL,
            "score_russian_keywords"    REAL,
            "score_missing_keywords"    REAL,
            "score_competitor_overlap"  REAL,
            "score_category_coverage"   REAL,
            "score_attribute_complete"  REAL,
            "score_brand"               REAL,
            "score_variant"             REAL,
            "score_content_rating"      REAL,
            "score_image_quality"       REAL,
            "score_title_quality"       REAL,
            "score_description_quality" REAL,
            "score_review_count"        REAL,
            "score_rating"              REAL,
            "score_visibility"          REAL,

            -- Raw evidence
            "russian_kw_found"          TEXT,  -- JSON array
            "russian_kw_missing"        TEXT,  -- JSON array
            "competitor_kw_overlap"     TEXT,  -- JSON array
            "title_word_count"          INTEGER,
            "description_char_count"    INTEGER,
            "image_count"               INTEGER,
            "attribute_count"           INTEGER,
            "missing_attributes"        TEXT,  -- JSON array

            -- Live data flags
            "has_live_sales"            INTEGER DEFAULT 0,
            "has_live_impressions"      INTEGER DEFAULT 0,
            "has_live_conversion"       INTEGER DEFAULT 0,

            "created_at"                TEXT DEFAULT (datetime('now')),
            "updated_at"                TEXT DEFAULT (datetime('now'))
        )
    `);
    console.log('✓ SEOAnalysis table OK');

    // ── 3. Upgrade ListingOptimization to add evidence & agent data ───────
    // Add columns if they don't exist (SQLite: just try, ignore errors)
    const cols = [
        `ALTER TABLE ListingOptimization ADD COLUMN "workflow_id" TEXT`,
        `ALTER TABLE ListingOptimization ADD COLUMN "seo_breakdown" TEXT`,
        `ALTER TABLE ListingOptimization ADD COLUMN "evidence" TEXT`,
        `ALTER TABLE ListingOptimization ADD COLUMN "data_source" TEXT DEFAULT 'ERP Database'`,
        `ALTER TABLE ListingOptimization ADD COLUMN "last_updated" TEXT`,
        `ALTER TABLE ListingOptimization ADD COLUMN "has_live_revenue" INTEGER DEFAULT 0`,
    ];
    for (const sql of cols) {
        try { await prisma.$executeRawUnsafe(sql); } catch {}
    }
    console.log('✓ ListingOptimization upgraded');

    console.log('\n✅ V6 Schema migration complete');
}

main().catch(console.error).finally(() => prisma.$disconnect());
