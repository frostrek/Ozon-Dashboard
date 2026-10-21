import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Use raw SQLite queries through Prisma to create tables
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AgentTask" (
            "id" TEXT PRIMARY KEY,
            "account_id" TEXT,
            "product_id" TEXT,
            "agent_name" TEXT NOT NULL,
            "severity" TEXT NOT NULL DEFAULT 'MODERATE',
            "status" TEXT NOT NULL DEFAULT 'PENDING',
            "risk_level" TEXT NOT NULL DEFAULT 'LOW',
            "what_is_wrong" TEXT NOT NULL,
            "why_is_wrong" TEXT,
            "suggested_value" TEXT,
            "expected_benefit" TEXT,
            "safe_to_auto" INTEGER NOT NULL DEFAULT 0,
            "field_name" TEXT,
            "before_value" TEXT,
            "after_value" TEXT,
            "compliance_passed" INTEGER NOT NULL DEFAULT 0,
            "compliance_note" TEXT,
            "applied_at" TEXT,
            "applied_by" TEXT,
            "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
            "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
    console.log('✓ AgentTask table ready');

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AgentRun" (
            "id" TEXT PRIMARY KEY,
            "agent_name" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'RUNNING',
            "products_scanned" INTEGER NOT NULL DEFAULT 0,
            "tasks_created" INTEGER NOT NULL DEFAULT 0,
            "tasks_auto_fixed" INTEGER NOT NULL DEFAULT 0,
            "error_message" TEXT,
            "started_at" TEXT NOT NULL DEFAULT (datetime('now')),
            "completed_at" TEXT
        )
    `);
    console.log('✓ AgentRun table ready');

    // Verify
    const tables = await prisma.$queryRawUnsafe(`
        SELECT name FROM sqlite_master WHERE type='table' AND name IN ('AgentTask','AgentRun')
    `);
    console.log('Tables confirmed:', tables.map(t => t.name).join(', '));
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
