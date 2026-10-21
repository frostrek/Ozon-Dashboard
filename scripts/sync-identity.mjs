import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();
const OZON_KEY = process.env.OZON_API_KEY;
const OZON_CID = process.env.OZON_CLIENT_ID;

const BATCH_SIZE = 500;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startSync() {
    console.log("🚀 Starting Identity Sync Pipeline...");
    if (!OZON_KEY || !OZON_CID) {
        console.error("❌ Missing Ozon credentials in .env");
        process.exit(1);
    }

    const headers = {
        'Client-Id': OZON_CID,
        'Api-Key': OZON_KEY,
        'Content-Type': 'application/json',
    };

    try {
        let last_id = '';
        let totalSynced = 0;

        while (true) {
            console.log(`📡 Fetching batch of ${BATCH_SIZE} products via /v3/product/info/list...`);
            
            const res = await fetch('https://api-seller.ozon.ru/v3/product/info/list', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    filter: { visibility: "ALL" },
                    last_id,
                    limit: BATCH_SIZE
                })
            });

            if (!res.ok) {
                console.error(`❌ Ozon API Error: ${res.status} ${res.statusText}`);
                break;
            }

            const data = await res.json();
            const items = data.result?.items || [];
            
            if (items.length === 0) break;

            const now = new Date().toISOString();
            console.log(`✅ Loaded ${items.length} items. Syncing identities...`);

            // Execute batch inserts
            for (const item of items) {
                const product_id = String(item.id);
                const offer_id = item.offer_id;
                const barcode = item.barcode || '';
                
                // Usually we'd map account_id properly, but we'll use a placeholder for standalone tasks
                await prisma.$executeRawUnsafe(`
                    INSERT INTO ProductIdentity (id, account_id, client_id, product_id, offer_id, barcode, last_sync_at)
                    VALUES ('${Math.random().toString(36).substring(7)}', 'PRIMARY_ACCOUNT', '${OZON_CID}', '${product_id}', '${offer_id}', '${barcode}', '${now}')
                    ON CONFLICT(product_id) DO UPDATE SET 
                        offer_id='${offer_id}', barcode='${barcode}', last_sync_at='${now}'
                `);
            }

            totalSynced += items.length;
            last_id = data.result?.last_id;
            
            if (!last_id) break;
            
            // Respect rate limits (1000 req / minute usually, but safe throttling)
            await sleep(1000); 
        }

        console.log(`🎉 Identity Sync Complete! Re-mapped ${totalSynced} products.`);
    } catch (e) {
        console.error("❌ Sync Crash:", e);
    } finally {
        await prisma.$disconnect();
    }
}

startSync();
