import { NextResponse } from 'next/server';
import { getMongoDb } from '../../../../lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function tokensFor(keyword) {
  return String(keyword || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.replace(/[%_]/g, ''))
    .filter((token) => token.length >= 2)
    .slice(0, 6);
}

export async function GET(request) {
  const keyword = new URL(request.url).searchParams.get('keyword')?.trim() || '';
  const tokens = tokensFor(keyword);
  if (!tokens.length) {
    return NextResponse.json({ error: 'Enter a keyword before looking up brands.', suggestions: [] }, { status: 400 });
  }

  try {
    const collection = (await getMongoDb()).collection('catalog_products');
    const rows = await collection.aggregate([
      {
        $match: {
          brand: { $nin: [null, ''] },
          $and: tokens.map((token) => ({ name: { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })),
        },
      },
      { $group: { _id: '$brand', products: { $sum: 1 } } },
      { $sort: { products: -1, _id: 1 } },
      { $limit: 12 },
    ]).toArray();
    return NextResponse.json({
      keyword,
      suggestions: rows.map((row) => ({
        brand: String(row._id),
        products: Number(row.products) || 0,
      })),
    });
  } catch {
    return NextResponse.json({
      keyword,
      suggestions: [],
      note: 'Brand suggestions could not be loaded. You can type a brand yourself.',
    });
  }
}
