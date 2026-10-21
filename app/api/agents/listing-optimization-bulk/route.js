import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import { ListingOptimizationAgent } from '../../../../lib/agents/ListingOptimizationAgent.js';

const prisma = new PrismaClient();

export async function POST(req) {
    const agent = new ListingOptimizationAgent();
    let processed = 0, flagged = 0, skipped = 0;
    
    try {
        const total = await prisma.product.count();
        const BATCH = 200;
        let offset = 0;

        while (offset < total) {
            const products = await prisma.product.findMany({
                skip: offset, take: BATCH,
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
                    else flagged++;
                    processed++;
                } catch(e) {
                    console.error('[Agent Bulk] Error on', p.id, e.message);
                }
            }
            offset += BATCH;
        }

        return NextResponse.json({ success: true, processed, flagged, skipped });
    } catch (err) {
        console.error('[Listing Opt Bulk]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
