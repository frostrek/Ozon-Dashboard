import { NextResponse } from 'next/server';
import { listOrdersPage, orderStatusCounts, ORDER_PAGE_SIZE } from '../../../lib/orders/listOrders';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  try {
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || ORDER_PAGE_SIZE;
    const status = url.searchParams.get('status') || 'ALL';
    const account = url.searchParams.get('account') || 'all';
    const date = url.searchParams.get('date') || 'all';
    const q = url.searchParams.get('q') || '';
    const [data, statusCounts] = await Promise.all([
      listOrdersPage({ page, pageSize, status, account, date, q }),
      orderStatusCounts(account),
    ]);
    return NextResponse.json({ ...data, statusCounts });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Orders could not be loaded.' }, { status: 500 });
  }
}
