import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function createTable() {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ListingOptimization" (
            "id" TEXT PRIMARY KEY,
            "product_id" TEXT UNIQUE,
            "account_id" TEXT,
            "seo_score" REAL,
            "content_rating" REAL,
            "visibility_score" REAL,
            "optimization_score" REAL,
            "problem_count" INTEGER DEFAULT 0,
            "recommendations" TEXT,
            "expected_revenue_gain" REAL,
            "expected_traffic_gain" REAL,
            "expected_conversion_gain" REAL,
            "approval_status" TEXT DEFAULT 'PENDING',
            "priority" TEXT DEFAULT 'LOW',
            "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
            "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
    console.log('ListingOptimization table created via SQL');
}

createTable().catch(console.error).finally(()=>prisma.$disconnect());
