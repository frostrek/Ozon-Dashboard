import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { dbStatusFor, DB_STATUS_LABEL } from '../../../../lib/orders/statusMap';
import { accountNamesById } from '../../../../lib/accountNames';

export const dynamic = 'force-dynamic';

const STATUSES = ['AWAITING_PACKAGING', 'AWAITING_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'ARBITRATION'];

function localDay(value, endOfDay) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

function dateWhere(dateFilter, from, to) {
  const start = localDay(from, false);
  const end = localDay(to, true);
  if (start || end) {
    const range = {};
    if (start) range.gte = start;
    if (end) range.lte = end;
    return range;
  }
  const now = new Date();
  if (dateFilter === 'today') {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    return { gte: day };
  }
  if (dateFilter === 'yesterday') {
    const day = new Date(now);
    day.setDate(day.getDate() - 1);
    day.setHours(0, 0, 0, 0);
    const last = new Date(now);
    last.setDate(last.getDate() - 1);
    last.setHours(23, 59, 59, 999);
    return { gte: day, lte: last };
  }
  if (dateFilter === 'week') {
    const day = new Date(now);
    day.setDate(day.getDate() - 7);
    day.setHours(0, 0, 0, 0);
    return { gte: day };
  }
  return null;
}

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const accountId = params.get('account') || 'all';
  const status = params.get('status') || 'ALL';
  const date = params.get('date') || 'all';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const q = (params.get('q') || '').trim();
  const warehouse = (params.get('warehouse') || '').trim();
  const sku = (params.get('sku') || '').trim().toLowerCase();

  const where = {};
  if (accountId !== 'all') where.account_id = accountId;
  if (STATUSES.includes(status)) where.status = status;
  else where.status = { in: ['AWAITING_PACKAGING', 'AWAITING_DELIVERY'] };
  const created = dateWhere(date, from, to);
  if (created) where.created_at = created;
  if (q) {
    where.OR = [
      { posting_number: { contains: q } },
      { raw_json: { contains: q } },
    ];
  }

  const [accounts, dbOrders] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.order.findMany({
      where,
      take: 2000,
      orderBy: [{ created_at: 'desc' }, { updated_at: 'desc' }],
    }),
  ]);
  const names = await accountNamesById(dbOrders.map((order) => order.account_id));

  const products = [];
  const warehouses = new Set();
  dbOrders.forEach((order) => {
    let parsed = {};
    try { parsed = JSON.parse(order.raw_json || '{}'); } catch { parsed = {}; }
    const ozonStatus = String(parsed.status || '').trim();
    const statusLabel = dbStatusFor(parsed.status, order.status);
    const labelReady = ozonStatus
      ? ozonStatus === 'awaiting_packaging' || ozonStatus === 'awaiting_approve' || ozonStatus === 'awaiting_deliver'
      : statusLabel === 'AWAITING_PACKAGING' || statusLabel === 'AWAITING_DELIVERY';
    if (!labelReady) return;
    const place = String(parsed.delivery_method?.warehouse || '').trim();
    if (place) warehouses.add(place);
    const items = Array.isArray(parsed.products) && parsed.products.length ? parsed.products : [null];
    items.forEach((product, index) => {
      const offer = String(product?.offer_id || product?.sku || '').trim();
      const name = product?.name || product?.title || '';
      if (warehouse && place !== warehouse) return;
      if (sku && !offer.toLowerCase().includes(sku) && !name.toLowerCase().includes(sku)) return;
      products.push({
        key: `${order.id}:${index}:${offer}`,
        orderId: order.id,
        postingNumber: order.posting_number,
        accountId: order.account_id,
        accountName: names[order.account_id] || '',
        status: statusLabel,
        statusLabel: DB_STATUS_LABEL[statusLabel] || statusLabel,
        name: name || 'No product name',
        sku: offer,
        quantity: Number(product?.quantity) || (product ? 1 : 0),
        warehouse: place,
        shipBy: parsed.shipment_date || parsed.in_process_at || order.created_at,
        createdAt: order.created_at,
      });
    });
  });

  products.sort((a, b) => {
    const aTime = new Date(a.createdAt || a.shipBy || 0).getTime();
    const bTime = new Date(b.createdAt || b.shipBy || 0).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

  return NextResponse.json({
    accounts,
    warehouses: [...warehouses].sort((a, b) => a.localeCompare(b)),
    products,
  });
}
