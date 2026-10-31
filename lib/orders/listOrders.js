import { prisma } from '../prisma';
import { dbStatusFor } from './statusMap';
import { withCache } from '../cache/upstash';

export const ORDER_PAGE_SIZE = 100;

export function orderWhere({ status = 'ALL', account = 'all', date = 'all', q = '' } = {}) {
  const where = {};
  if (status && status !== 'ALL') where.status = status;
  if (account && account !== 'all') where.account_id = account;
  if (date && date !== 'all') {
    const now = new Date();
    if (date === 'today') {
      where.created_at = { gte: new Date(now.setHours(0, 0, 0, 0)) };
    } else if (date === 'yesterday') {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      where.created_at = { gte: start, lte: end };
    } else if (date === 'week') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      where.created_at = { gte: start };
    }
  }
  const needle = String(q || '').trim();
  if (needle) {
    where.OR = [
      { posting_number: { contains: needle } },
      { customer_name: { contains: needle } },
    ];
  }
  return where;
}

export async function orderStatusCounts(account = 'all') {
  const key = `orders:counts:v1:${account}`;
  return withCache(key, 45, async () => {
    const baseWhere = account !== 'all' ? { account_id: account } : {};
    const tabs = ['AWAITING_PACKAGING', 'AWAITING_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
    const [_total, ...rest] = await Promise.all([
      prisma.order.count({ where: baseWhere }),
      ...tabs.map((status) => prisma.order.count({ where: { ...baseWhere, status } })),
    ]);
    const counts = { _total };
    tabs.forEach((status, index) => {
      counts[status] = rest[index];
    });
    return counts;
  });
}

export async function listOrdersPage({
  page = 1,
  pageSize = ORDER_PAGE_SIZE,
  status = 'ALL',
  account = 'all',
  date = 'all',
  q = '',
} = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || ORDER_PAGE_SIZE));
  const current = Math.max(1, Number(page) || 1);
  const where = orderWhere({ status, account, date, q });
  const key = `orders:v1:${status}:${account}:${date}:${String(q).trim().toLowerCase()}:p${current}:s${size}`;

  return withCache(key, 45, async () => {
    const filteredCount = await prisma.order.count({ where });
    const pageCount = Math.max(1, Math.ceil(filteredCount / size));
    const safePage = Math.min(current, pageCount);
    const rows = filteredCount
      ? await prisma.order.findMany({
        where,
        skip: (safePage - 1) * size,
        take: size,
        include: {
          account: { select: { name: true } },
          statusHistory: { orderBy: { changed_at: 'asc' } },
        },
        orderBy: { updated_at: 'desc' },
      })
      : [];
    const orders = rows.map((order) => {
      let parsed = {};
      try { parsed = JSON.parse(order.raw_json); } catch { parsed = {}; }
      return {
        id: order.id,
        account_id: order.account_id,
        posting_number: order.posting_number,
        status: dbStatusFor(parsed.status, order.status),
        created_at: order.created_at,
        customer_name: order.customer_name,
        _accountName: order.account?.name,
        _parsed: parsed,
        _history: order.statusHistory,
      };
    });
    return {
      orders,
      filteredCount,
      page: safePage,
      pageSize: size,
      pageCount,
    };
  });
}
