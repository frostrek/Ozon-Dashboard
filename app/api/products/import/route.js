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

  // Handle parent product & variant linking
  let parentProduct = null;
  let variantGroupId = body.variantGroupId ? String(body.variantGroupId).trim() : null;
  let isVariant = Boolean(body.isVariant || body.parentProductId || variantGroupId);

  if (body.parentProductId) {
    parentProduct = await prisma.product.findUnique({ where: { id: String(body.parentProductId) } });
    if (parentProduct) {
      isVariant = true;
      if (!variantGroupId) {
        variantGroupId = parentProduct.variant_group_id || `vg_${parentProduct.id}`;
      }
      // Ensure the parent product is also marked with this variant_group_id
      if (parentProduct.variant_group_id !== variantGroupId) {
        await prisma.product.update({
          where: { id: parentProduct.id },
          data: {
            variant_group_id: variantGroupId,
            is_variant: true,
          },
        });
      }
    }
  }

  const modelName = String(body.modelName || (parentProduct ? parentProduct.name : '') || '').trim();
  const modelGroupName = String(body.modelGroupName || modelName || (parentProduct ? (parentProduct.variant_group_id || parentProduct.name) : '') || '').trim();

  if (!variantGroupId && modelGroupName) {
    const slug = modelGroupName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    variantGroupId = `vg_${slug}`;
    isVariant = true;
  }

  const parentAttrs = parentProduct ? (tryParse(parentProduct.attributes_json) || {}) : {};
  const categoryId = body.categoryId || parentAttrs.description_category_id || '';
  const typeId = body.typeId || parentAttrs.type_id || '';
  const brand = String(body.brand || parentProduct?.brand || '').trim();
  const vat = body.vat != null && body.vat !== '' ? body.vat : (parentAttrs.vat != null ? parentAttrs.vat : '');

  const images = String(body.images || '').split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const draft = {
    sku: String(body.sku || '').trim(),
    name: String(body.name || '').trim(),
    brand: brand || null,
    price: body.price === '' || body.price == null ? null : Number(body.price),
    old_price: body.oldPrice === '' || body.oldPrice == null ? null : Number(body.oldPrice),
    currency: String(body.currency || '').trim() || 'RUB',
    variant_group_id: variantGroupId || null,
    images_json: JSON.stringify(images),
    attributes_json: JSON.stringify({
      description: String(body.description || parentAttrs.description || '').trim(),
      description_attribute_id: body.descriptionAttributeId || parentAttrs.description_attribute_id || '',
      description_category_id: categoryId,
      type_id: typeId,
      vat,
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
      model_name: modelName || undefined,
      model_group_name: modelGroupName || undefined,
      variant_group_id: variantGroupId || undefined,
      variant_value: body.variantValue ? String(body.variantValue).trim() : undefined,
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
      variant_group_id: variantGroupId || null,
      is_variant: isVariant,
      images_json: draft.images_json,
      attributes_json: draft.attributes_json,
    },
    include: { account: true },
  });
}

function tryParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
