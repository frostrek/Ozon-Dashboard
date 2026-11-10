import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { dbStatusFor, DB_STATUS_LABEL } from '../../../../lib/orders/statusMap';
import { accountNamesById } from '../../../../lib/accountNames';
import { translateBulk } from '../../../../lib/labels/utils/translate';

export const dynamic = 'force-dynamic';

const STATUSES = ['AWAITING_PACKAGING', 'AWAITING_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'ARBITRATION'];

// In-Memory SWR Cache for Labels Orders (15s TTL)
const routeCache = new Map();
const CACHE_TTL_MS = 15_000;

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
  const cacheKey = params.toString() || 'all';

  // Check in-memory SWR cache
  const cached = routeCache.get(cacheKey);
  if (cached && (Date.now() - cached.time < CACHE_TTL_MS)) {
    return NextResponse.json(cached.payload, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' },
    });
  }

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

  // Optimization 1: Precise Column Selection (drastically reduces DB network payload)
  const [accounts, dbOrders] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.order.findMany({
      where,
      select: {
        id: true,
        account_id: true,
        posting_number: true,
        status: true,
        created_at: true,
        raw_json: true,
      },
      take: 2000,
      orderBy: [{ created_at: 'desc' }, { updated_at: 'desc' }],
    }),
  ]);
  const names = await accountNamesById(dbOrders.map((order) => order.account_id));

  // Optimization 2: Single-Pass Parsing & Cyrillic Collection (eliminates double JSON.parse)
  const allNames = new Set();
  const warehouses = new Set();
  const validParsedOrders = [];

  for (const order of dbOrders) {
    let parsed = {};
    if (order.raw_json) {
      try { parsed = JSON.parse(order.raw_json); } catch { parsed = {}; }
    }
    const statusLabel = order.status || dbStatusFor(parsed.status, 'AWAITING_PACKAGING');
    const labelReady = statusLabel === 'AWAITING_PACKAGING' || statusLabel === 'AWAITING_DELIVERY';
    if (!labelReady) continue;
    if (status && status !== 'ALL' && statusLabel !== status) continue;

    const place = String(parsed.delivery_method?.warehouse || '').trim();
    if (place) warehouses.add(place);
    if (warehouse && place !== warehouse) continue;

    const items = Array.isArray(parsed.products) && parsed.products.length ? parsed.products : [null];
    for (const p of items) {
      const n = p?.name || p?.title;
      if (n && /[а-яА-ЯёЁ]/.test(n)) allNames.add(n);
    }

    validParsedOrders.push({
      order,
      parsed,
      statusLabel,
      place,
      items,
    });
  }

  // Translation (warm cache or batch)
  const translatedNameMap = new Map();
  if (allNames.size > 0) {
    try {
      const uniqueNames = [...allNames];
      const translated = await translateBulk(uniqueNames);
      uniqueNames.forEach((orig, idx) => {
        translatedNameMap.set(orig, translated[idx] || orig);
      });
    } catch (err) {
      console.error('[labels/orders] Translation error:', err);
    }
  }

  // Optimization 3: Pre-computed Sort Timestamps
  const products = [];
  for (const entry of validParsedOrders) {
    const { order, parsed, statusLabel, place, items } = entry;
    const accountName = names[order.account_id] || '';
    const shipBy = parsed.shipment_date || parsed.in_process_at || order.created_at;
    const createdAt = order.created_at;
    const timeSort = new Date(createdAt || shipBy || 0).getTime() || 0;

    items.forEach((product, index) => {
      const offer = String(product?.offer_id || product?.sku || '').trim();
      let name = product?.name || product?.title || '';
      if (translatedNameMap.has(name)) {
        name = translatedNameMap.get(name);
      }
      if (sku && !offer.toLowerCase().includes(sku) && !name.toLowerCase().includes(sku)) return;

      products.push({
        key: `${order.id}:${index}:${offer}`,
        orderId: order.id,
        postingNumber: order.posting_number,
        accountId: order.account_id,
        accountName,
        status: statusLabel,
        statusLabel: DB_STATUS_LABEL[statusLabel] || statusLabel,
        name: name || 'No product name',
        sku: offer,
        quantity: Number(product?.quantity) || (product ? 1 : 0),
        warehouse: place,
        shipBy,
        createdAt,
        _time: timeSort,
      });
    });
  }

  products.sort((a, b) => b._time - a._time);
  for (const p of products) delete p._time;

  const payload = {
    accounts,
    warehouses: [...warehouses].sort((a, b) => a.localeCompare(b)),
    products,
  };

  // Cache response in memory
  if (routeCache.size > 50) routeCache.clear();
  routeCache.set(cacheKey, { time: Date.now(), payload });

  return NextResponse.json(payload, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' },
  });
}
