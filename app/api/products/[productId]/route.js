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
    const images = String(fields.images || '')
      .split(/[\s,]+/)
      .map((url) => url.trim())
      .filter((url) => /^https:\/\//i.test(url));
    const nextAttrs = {
      ...previousAttrs,
      description: String(fields.description || ''),
      color: String(fields.color || ''),
      size: String(fields.size || ''),
      keywords: String(fields.keywords || ''),
      hashtags: String(fields.hashtags || ''),
      vat: fields.vat === '' || fields.vat == null ? previousAttrs.vat : String(fields.vat),
      barcode: String(fields.barcode || previousAttrs.barcode || ''),
      description_category_id: fields.description_category_id || previousAttrs.description_category_id || '',
      type_id: fields.type_id || previousAttrs.type_id || '',
      weight: fields.weight === '' || fields.weight == null ? previousAttrs.weight : numberOr(fields.weight, previousAttrs.weight),
      depth: fields.depth === '' || fields.depth == null ? previousAttrs.depth : numberOr(fields.depth, previousAttrs.depth),
      width: fields.width === '' || fields.width == null ? previousAttrs.width : numberOr(fields.width, previousAttrs.width),
      height: fields.height === '' || fields.height == null ? previousAttrs.height : numberOr(fields.height, previousAttrs.height),
      weight_unit: previousAttrs.weight_unit || 'g',
      dimension_unit: previousAttrs.dimension_unit || 'mm',
      warehouse_id: fields.warehouse_id || previousAttrs.warehouse_id || '',
      warehouse_name: fields.warehouse_name || previousAttrs.warehouse_name || '',
    };

    await prisma.product.update({
      where: { id: productId },
      data: {
        name: String(fields.name || product.name),
        sku: String(fields.sku || product.sku),
        brand: String(fields.brand || '') || null,
        price: numberOr(fields.price, product.price),
        old_price: numberOr(fields.old_price, product.old_price),
        currency: String(fields.currency || product.currency || 'RUB'),
        stock: Math.round(numberOr(fields.stock, product.stock)),
        volume_weight: numberOr(fields.weight, product.volume_weight),
        images_json: JSON.stringify(images.length ? images : JSON.parse(product.images_json || '[]')),
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
    if (!row || row.status === 'failed' || /Price was not updated/i.test(row.warning || '')) {
      return NextResponse.json({
        saved: true,
        pushed: false,
        error: row?.error || row?.warning || 'Ozon did not accept this listing.',
        report,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      pushed: true,
      priceUpdated: true,
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
