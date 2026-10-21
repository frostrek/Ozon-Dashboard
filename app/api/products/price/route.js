import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { id, price, old_price } = await req.json();

        const product = await prisma.product.findUnique({
            where: { id },
            include: { account: true }
        });

        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        const headers = {
            'Client-Id': product.account.client_id,
            'Api-Key': product.account.api_key,
            'Content-Type': 'application/json'
        };

        // 1. PUSH TO OZON
        const ozonPayload = {
            prices: [
                {
                    offer_id: product.sku,
                    price: String(price),
                    old_price: old_price ? String(old_price) : String(product.old_price || 0),
                    currency_code: product.currency || 'USD'
                }
            ]
        };

        const ozonRes = await fetch('https://api-seller.ozon.ru/v1/product/import/prices', {
            method: 'POST',
            headers,
            body: JSON.stringify(ozonPayload)
        });

        const ozonData = await ozonRes.json();
        const success = ozonData?.result?.[0]?.updated || false;

        // 2. LOG AUDIT
        await prisma.auditLog.create({
            data: {
                account_id: product.account_id,
                product_id: product.id,
                type: 'PRICE',
                old_value: String(product.price),
                new_value: String(price),
                status: success ? 'SUCCESS' : 'FAILED',
                error: success ? null : JSON.stringify(ozonData)
            }
        });

        if (!success) {
            return NextResponse.json({ error: 'Ozon update failed', details: ozonData }, { status: 400 });
        }

        // 3. UPDATE DB
        const updated = await prisma.product.update({
            where: { id },
            data: { 
                price: parseFloat(price),
                old_price: old_price ? parseFloat(old_price) : product.old_price
            }
        });

        return NextResponse.json({ success: true, product: updated });

    } catch (error) {
        console.error('Price update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
