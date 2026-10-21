import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { importStoredProducts } from '../../../../../lib/ozon/importBatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids = [...new Set((Array.isArray(body.productIds) ? body.productIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return NextResponse.json({ error: 'Select at least one product.' }, { status: 400 });

    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      include: { account: true },
    });
    if (!products.length) return NextResponse.json({ error: 'None of the selected products were found.' }, { status: 404 });

    const report = await importStoredProducts(products);
    return NextResponse.json(report);
  } catch (error) {
    console.error('[ozon-import]', error.ozonStatus || '', error.message);
    return NextResponse.json(
      { error: error.message || 'Ozon did not accept these products.' },
      { status: error.status && error.status < 500 ? error.status : 500 },
    );
  }
}
