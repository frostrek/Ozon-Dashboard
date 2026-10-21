import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { mapProductToOzonItem } from '../../../../lib/ozon/mapProductImport';
import { importStoredProducts } from '../../../../lib/ozon/importBatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.productId || '');
    const product = id
      ? await prisma.product.findUnique({ where: { id }, include: { account: true } })
      : await createDraft(body);
    if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

    const report = await importStoredProducts([product]);
    const row = report.results[0];
    if (!row || row.status === 'failed') {
      return NextResponse.json({ error: row?.error || 'Ozon did not accept this product.', report }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      taskId: row.taskId,
      offerId: row.offerId,
      action: row.action,
      status: row.status,
      warning: row.warning || '',
    });
  } catch (error) {
    console.error('[ozon-import]', error.ozonStatus || '', error.message);
    return NextResponse.json(
      { error: error.message || 'Ozon did not accept this product.' },
      { status: error.status && error.status < 500 ? error.status : 500 },
    );
  }
}

async function createDraft(body) {
  const accountId = String(body.accountId || '');
  const account = accountId
    ? await prisma.account.findUnique({ where: { id: accountId } })
    : null;
  if (!account) {
    const error = new Error('Choose a seller account.');
    error.status = 400;
    throw error;
  }

  const images = String(body.images || '').split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const draft = {
    sku: String(body.sku || '').trim(),
    name: String(body.name || '').trim(),
    brand: String(body.brand || '').trim(),
    price: body.price === '' || body.price == null ? null : Number(body.price),
    old_price: body.oldPrice === '' || body.oldPrice == null ? null : Number(body.oldPrice),
    currency: String(body.currency || '').trim() || 'RUB',
    images_json: JSON.stringify(images),
    attributes_json: JSON.stringify({
      description: String(body.description || '').trim(),
      description_attribute_id: body.descriptionAttributeId || '',
      description_category_id: body.categoryId,
      type_id: body.typeId,
      vat: body.vat,
      weight: body.weight,
      depth: body.depth,
      width: body.width,
      height: body.height,
      weight_unit: 'g',
      dimension_unit: 'mm',
      barcode: String(body.barcode || '').trim(),
      color: String(body.color || '').trim(),
      size: String(body.size || '').trim(),
      material: String(body.material || '').trim(),
    }),
  };
  mapProductToOzonItem(draft);

  return prisma.product.create({
    data: {
      account_id: account.id,
      ozon_id: `local-${randomUUID()}`,
      sku: draft.sku,
      name: draft.name,
      brand: draft.brand || null,
      price: draft.price,
      old_price: draft.old_price,
      currency: draft.currency,
      status: 'PENDING',
      status_name: 'Not sent yet',
      images_json: draft.images_json,
      attributes_json: draft.attributes_json,
    },
    include: { account: true },
  });
}
