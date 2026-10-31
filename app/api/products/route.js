import { NextResponse } from 'next/server';
import { listProductsPage, productTabCounts, PRODUCT_PAGE_SIZE } from '../../../lib/products/listProducts';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page')) || 1;
  const pageSize = Number(url.searchParams.get('pageSize')) || PRODUCT_PAGE_SIZE;
  const tab = url.searchParams.get('tab') || 'ALL';
  const account = url.searchParams.get('account') || 'all';
  const list = url.searchParams.get('list') || 'all';
  const q = url.searchParams.get('q') || '';
  try {
    const [data, counts] = await Promise.all([
      listProductsPage({ page, pageSize, tab, account, list, q }),
      productTabCounts(account),
    ]);
    return NextResponse.json({ ...data, counts });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Products could not be loaded.' }, { status: 500 });
  }
}
