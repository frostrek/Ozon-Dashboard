import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { id, stock } = await req.json();

        const product = await prisma.product.findUnique({
            where: { id },
            include: { account: true }
        });

        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // Fetch Warehouse for this account
        const whRes = await fetch('https://api-seller.ozon.ru/v2/warehouse/list', {
            method: 'POST',
            headers: {
                'Client-Id': product.account.client_id,
                'Api-Key': product.account.api_key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        const whData = await whRes.json();
        const warehouseId = whData?.result?.[0]?.warehouse_id || whData?.warehouses?.[0]?.warehouse_id;

        if (!warehouseId) {
            return NextResponse.json({ error: 'No warehouse found for account' }, { status: 400 });
        }

        const headers = {
            'Client-Id': product.account.client_id,
            'Api-Key': product.account.api_key,
            'Content-Type': 'application/json'
        };

        // PUSH TO OZON
        const ozonPayload = {
            stocks: [
                {
                    offer_id: product.sku,
                    stock: parseInt(stock),
                    warehouse_id: warehouseId
                }
            ]
        };

        const ozonRes = await fetch('https://api-seller.ozon.ru/v1/product/import/stocks', {
            method: 'POST',
            headers,
            body: JSON.stringify(ozonPayload)
        });

        const ozonData = await ozonRes.json();
        const success = ozonData?.result?.[0]?.updated || false;

        // LOG AUDIT
        await prisma.auditLog.create({
            data: {
                account_id: product.account_id,
                product_id: product.id,
                type: 'STOCK',
                old_value: String(product.stock),
                new_value: String(stock),
                status: success ? 'SUCCESS' : 'FAILED',
                error: success ? null : JSON.stringify(ozonData)
            }
        });

        if (!success) {
            return NextResponse.json({ error: 'Ozon update failed', details: ozonData }, { status: 400 });
        }

        // UPDATE DB
        const updated = await prisma.product.update({
            where: { id },
            data: { stock: parseInt(stock) }
        });

        return NextResponse.json({ success: true, product: updated });

    } catch (error) {
        console.error('Stock update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
