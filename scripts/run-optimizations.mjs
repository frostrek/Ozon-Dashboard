import { PrismaClient } from '@prisma/client';
import { ListingOptimizationAgent } from '../lib/agents/ListingOptimizationAgent.js';

const prisma = new PrismaClient();
const agent = new ListingOptimizationAgent();

async function runBulkScan() {
    const total = await prisma.product.count();
    console.log(`[Bulk Scan] ${total} products to audit`);

    const BATCH = 200;
    let offset = 0;
    let processed = 0, skipped = 0, flagged = 0;

    while (offset < total) {
        const products = await prisma.product.findMany({
            skip: offset,
            take: BATCH,
            select: {
                id: true, name: true, brand: true, sku: true, price: true, stock: true,
                sales: true, content_rating: true, images_json: true, attributes_json: true,
                account_id: true, category_name: true
            }
        });

        for (const p of products) {
            try {
                const result = await agent.run(p);
                if (result.status === 'ALREADY_OPTIMIZED') skipped++;
                else { flagged++; }
                processed++;
            } catch(e) {
                console.error(`[Scan] Error on ${p.id}:`, e.message);
            }
        }

        offset += BATCH;
        console.log(`  ↳ Processed ${offset}/${total} | Flagged: ${flagged} | Skipped (optimized): ${skipped}`);
    }

    console.log(`\n✅ Bulk Scan Complete`);
    console.log(`   Products Analyzed: ${processed}`);
    console.log(`   Issues Found: ${flagged}`);
    console.log(`   Already Optimized: ${skipped}`);
}

runBulkScan().catch(console.error).finally(()=>prisma.$disconnect());
