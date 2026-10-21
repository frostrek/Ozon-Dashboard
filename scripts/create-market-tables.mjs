import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "MarketRecommendation"`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "MarketKeyword"`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "MarketCategory"`);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE "MarketRecommendation" (
            "id" TEXT PRIMARY KEY,
            "type" TEXT NOT NULL,
            "product_id" TEXT,
            "sku" TEXT,
            "product_name" TEXT NOT NULL,
            "brand" TEXT,
            "category" TEXT,
            
            -- Current Catalog Stats (Section 1)
            "current_content_rating" REAL,
            "current_seo_score" REAL,
            "current_images" INTEGER,
            "current_inventory" INTEGER,
            "current_revenue" REAL,
            "current_orders" INTEGER,
            "current_views" INTEGER,
            
            -- The 7-Question Format
            "what_is_wrong" TEXT,
            "why_is_wrong" TEXT,
            "how_detected" TEXT,
            "exact_value" TEXT,
            "expected_improvement" TEXT,
            "generated_by_agent" TEXT,
            "auto_applied" BOOLEAN DEFAULT false,
            
            -- Scoring & Priority
            "opportunity_score" INTEGER,
            "demand_score" INTEGER,
            "competition_score" INTEGER,
            "risk_score" INTEGER,
            "priority" TEXT, -- CRITICAL, HIGH, MEDIUM, LOW
            "confidence_pct" INTEGER,
            
            -- Procurement / New Opps (Section 2)
            "amazon_product_name" TEXT,
            "asin" TEXT,
            "supplier" TEXT,
            "buying_price" REAL,
            "shipping_cost" REAL,
            "import_cost" REAL,
            "ozon_commission" REAL,
            "amazon_price" REAL,
            "expected_selling_price" REAL,
            "expected_profit" REAL,
            "expected_margin" REAL,
            "roi" REAL,
            "monthly_revenue_est" REAL,
            
            "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE "MarketKeyword" (
            "id" TEXT PRIMARY KEY,
            "keyword" TEXT NOT NULL,
            "volume" INTEGER,
            "growth_pct" REAL,
            "competition" TEXT,
            "difficulty" TEXT,
            "products_using" INTEGER,
            "products_missing" INTEGER,
            "suggested_category" TEXT,
            "suggested_products" TEXT,
            "expected_traffic_gain" INTEGER,
            "ai_suggested_title" TEXT,
            "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TABLE "MarketCategory" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT NOT NULL,
            "trend" TEXT,
            "my_listings_count" INTEGER,
            "competitor_listings_count" INTEGER,
            "growth_pct" REAL,
            "demand_pct" REAL,
            "avg_selling_price" REAL,
            "avg_margin" REAL,
            "recommendation" TEXT, -- Upload More, Improve Existing, Avoid
            "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    console.log('✓ V6 AI Business Advisor tables created with full operating system schema!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
