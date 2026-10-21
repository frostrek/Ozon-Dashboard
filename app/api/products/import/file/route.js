import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { mapProductToOzonItem } from '../../../../../lib/ozon/mapProductImport';
import { importStoredProducts } from '../../../../../lib/ozon/importBatch';
import { parseCsvProducts, parseXlsxProducts } from '../../../../../lib/ozon/parseProductSheet';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req) {
  try {
    const form = await req.formData();
    const accountId = String(form.get('accountId') || '');
    const file = form.get('file');
    const account = accountId ? await prisma.account.findUnique({ where: { id: accountId } }) : null;
    if (!account) return NextResponse.json({ error: 'Choose a seller account.' }, { status: 400 });
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a CSV or Excel file.' }, { status: 400 });

    const name = file.name || '';
    if (!/\.(csv|xlsx)$/i.test(name)) {
      return NextResponse.json({ error: 'Upload a .csv or .xlsx file.' }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > 2_000_000) return NextResponse.json({ error: 'The file is larger than 2 MB.' }, { status: 400 });

    const drafts = /\.csv$/i.test(name) ? parseCsvProducts(bytes.toString('utf8')) : await parseXlsxProducts(bytes);
    if (!drafts.length) return NextResponse.json({ error: 'The file has no product rows.' }, { status: 400 });

    const failed = [];
    const saved = [];
    for (const draft of drafts) {
      try {
        mapProductToOzonItem(draft);
        saved.push(await upsertDraft(account, draft));
      } catch (error) {
        failed.push({
          productId: null,
          offerId: draft.sku || '',
          status: 'failed',
          action: 'create',
          taskId: null,
          ozonProductId: null,
          error: `Row ${draft.row}: ${error.message}`,
          warning: '',
        });
      }
    }

    const imported = saved.length ? await importStoredProducts(saved) : { results: [] };
    const results = [...failed, ...imported.results];
    return NextResponse.json({
      total: results.length,
      success: results.filter((row) => row.status === 'success').length,
      failed: results.filter((row) => row.status === 'failed').length,
      pending: results.filter((row) => row.status === 'pending').length,
      results,
    });
  } catch (error) {
    console.error('[ozon-import]', error.ozonStatus || '', error.message);
    return NextResponse.json(
      { error: error.message || 'The file could not be imported.' },
      { status: error.status && error.status < 500 ? error.status : 500 },
    );
  }
}

async function upsertDraft(account, draft) {
  const existing = await prisma.product.findFirst({
    where: { account_id: account.id, sku: draft.sku },
  });
  const data = {
    name: draft.name,
    brand: draft.brand || null,
    price: draft.price,
    old_price: Number.isFinite(draft.old_price) ? draft.old_price : null,
    currency: draft.currency,
    stock: Number.isFinite(draft.stock) ? draft.stock : 0,
    images_json: draft.images_json,
    attributes_json: draft.attributes_json,
    status: 'PENDING',
    status_name: 'Not sent yet',
  };
  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data,
      include: { account: true },
    });
  }
  return prisma.product.create({
    data: {
      ...data,
      account_id: account.id,
      ozon_id: `local-${randomUUID()}`,
      sku: draft.sku,
    },
    include: { account: true },
  });
}
