import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';
import { removeOfferFromOzon } from '../../../../lib/ozon/sellerClient';
import { importStoredProducts } from '../../../../lib/ozon/importBatch';

function readAttrs(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

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
      include: { account: true },
    });
    if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

    const previousAttrs = readAttrs(product.attributes_json);
    const nextAttrs = {
      ...previousAttrs,
      description: String(fields.description || ''),
      color: String(fields.color || ''),
      size: String(fields.size || ''),
      keywords: String(fields.keywords || ''),
      hashtags: String(fields.hashtags || ''),
    };
    if (fields.weight !== '' && fields.weight != null) nextAttrs.weight = numberOr(fields.weight, previousAttrs.weight);

    await prisma.product.update({
      where: { id: productId },
      data: {
        name: String(fields.name || product.name),
        brand: String(fields.brand || '') || null,
        price: numberOr(fields.price, product.price),
        old_price: numberOr(fields.old_price, product.old_price),
        stock: Math.round(numberOr(fields.stock, product.stock)),
        volume_weight: numberOr(fields.weight, product.volume_weight),
        attributes_json: JSON.stringify(nextAttrs),
      },
    });

    if (!pushToOzon) {
      return NextResponse.json({ success: true, pushed: false });
    }

    const fresh = await prisma.product.findUnique({
      where: { id: productId },
      include: { account: true },
    });
    const report = await importStoredProducts([fresh]);
    const row = report.results[0];
    if (!row || row.status === 'failed') {
      return NextResponse.json({
        saved: true,
        pushed: false,
        error: row?.error || 'Ozon did not accept this listing.',
        report,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      pushed: true,
      taskId: row.taskId || null,
      action: row.action || 'update',
      status: row.status,
      warning: row.warning || '',
    });
  } catch (error) {
    console.error('[product-update]', error);
    return NextResponse.json(
      { error: error.message || 'This listing could not be saved.' },
      { status: error.status && error.status < 500 ? error.status : 500 },
    );
  }
}
