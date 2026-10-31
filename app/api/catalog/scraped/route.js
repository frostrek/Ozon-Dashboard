import { NextResponse } from 'next/server';
import { deleteScrapedProduct, listScrapedProducts } from '../../../../lib/catalog/scrapedProducts';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  try {
    const data = await listScrapedProducts({
      q: url.searchParams.get('q') || '',
      brand: url.searchParams.get('brand') || 'all',
      status: url.searchParams.get('status') || 'all',
      date: url.searchParams.get('date') || 'all',
      page: url.searchParams.get('page') || '1',
      pageSize: url.searchParams.get('pageSize') || '100',
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Scraped products could not be loaded.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const asin = new URL(request.url).searchParams.get('asin');
  try {
    const result = await deleteScrapedProduct(asin);
    if (!result.deleted) {
      return NextResponse.json({ error: 'That scraped product was not found.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, asin });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'The scraped product could not be deleted.' }, { status: 500 });
  }
}
