import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';
import { removeOfferFromOzon } from '../../../../lib/ozon/sellerClient';

export async function DELETE(_req, { params }) {
    try {
        const { productId } = params;
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { account: true },
        });
        if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
        if (product.sku && product.account?.client_id && product.account?.api_key) {
            await removeOfferFromOzon(product.account, product.sku);
        }
        await prisma.product.delete({ where: { id: productId } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[product-delete]', error.ozonStatus || error.status || '', error.message);
        const status = error.ozonExhausted || error.status === 429 ? 429 : (error.status && error.status < 500 ? error.status : 500);
        return NextResponse.json(
            { error: error.message || 'This product could not be removed from Ozon.' },
            { status },
        );
    }
}

export async function PATCH(req, { params }) {
    try {
        const { productId } = params;
        const data = await req.json();
        const { pushToOzon, ...fields } = data;

        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { account: true }
        });

        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // 1. UPDATE LOCAL DB
        const updated = await prisma.product.update({
            where: { id: productId },
            data: {
                name: fields.name,
                brand: fields.brand,
                price: parseFloat(fields.price),
                old_price: parseFloat(fields.old_price),
                stock: parseInt(fields.stock),
                volume_weight: parseFloat(fields.weight),
                // Update raw attributes JSON
                attributes_json: JSON.stringify({
                    ...JSON.parse(product.attributes_json || '{}'),
                    description: fields.description,
                    color: fields.color,
                    size: fields.size,
                    keywords: fields.keywords,
                    hashtags: fields.hashtags
                })
            }
        });

        // 2. PUSH TO OZON IF REQUESTED
        if (pushToOzon) {
            const headers = {
                'Client-Id': product.account.client_id,
                'Api-Key': product.account.api_key,
                'Content-Type': 'application/json'
            };

            // SYNC PRICE
            await fetch('https://api-seller.ozon.ru/v1/product/import/prices', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    prices: [{
                        offer_id: product.sku,
                        price: String(fields.price),
                        old_price: String(fields.old_price),
                        currency_code: product.currency || 'USD'
                    }]
                })
            });

            // SYNC STOCK (Need Warehouse ID)
            const whRes = await fetch('https://api-seller.ozon.ru/v2/warehouse/list', {
                method: 'POST', headers, body: JSON.stringify({})
            });
            const whData = await whRes.json();
            const whId = whData?.result?.[0]?.warehouse_id || whData?.warehouses?.[0]?.warehouse_id;
            
            if (whId) {
                await fetch('https://api-seller.ozon.ru/v1/product/import/stocks', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        stocks: [{ offer_id: product.sku, stock: parseInt(fields.stock), warehouse_id: whId }]
                    })
                });
            }

            // SYNC ATTRIBUTES (Simplified for Demo, usually requires dictionary IDs)
            // For now, we log the attempt
            await prisma.auditLog.create({
                data: {
                    account_id: product.account_id,
                    product_id: product.id,
                    type: 'FULL_SYNC',
                    old_value: 'N/A',
                    new_value: 'Sync Triggered',
                    status: 'SUCCESS'
                }
            });
        }

        return NextResponse.json({ success: true, product: updated });

    } catch (error) {
        console.error('Update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
