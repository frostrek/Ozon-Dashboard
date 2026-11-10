import { prisma } from '../prisma';
import { dbStatusFor } from './statusMap';
import { withCache } from '../cache/upstash';
import { accountNamesById } from '../accountNames';
import { translateBulk } from '../labels/utils/translate';

export const ORDER_PAGE_SIZE = 25;

export function orderWhere({ status = 'ALL', account = 'all', date = 'all', from = '', to = '', fromTime = '', toTime = '', q = '' } = {}) {
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
    } else if (date === 'custom') {
      const range = {};
      if (from) {
        const timePart = fromTime ? `${fromTime}:00` : '00:00:00';
        const d = new Date(`${from}T${timePart}`);
        if (!isNaN(d.getTime())) range.gte = d;
      }
      if (to) {
        const timePart = toTime ? `${toTime}:59.999` : '23:59:59.999';
        const d = new Date(`${to}T${timePart}`);
        if (!isNaN(d.getTime())) range.lte = d;
      }
      if (range.gte || range.lte) {
        where.created_at = range;
      }
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
  const key = `orders:counts:v2:${account}`;
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
  from = '',
  to = '',
  fromTime = '',
  toTime = '',
  q = '',
} = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || ORDER_PAGE_SIZE));
  const current = Math.max(1, Number(page) || 1);
  const where = orderWhere({ status, account, date, from, to, fromTime, toTime, q });
  const key = `orders:v6:${status}:${account}:${date}:${from}:${to}:${fromTime}:${toTime}:${String(q).trim().toLowerCase()}:p${current}:s${size}`;

  const load = async () => {
    const filteredCount = await prisma.order.count({ where });
    const pageCount = Math.max(1, Math.ceil(filteredCount / size));
    if (current > pageCount || filteredCount === 0) {
      return {
        orders: [],
        filteredCount,
        page: current,
        pageSize: size,
        pageCount,
        hasMore: false,
      };
    }
    const rows = await prisma.order.findMany({
      where,
      skip: (current - 1) * size,
      take: size,
      include: {
        statusHistory: { orderBy: { changed_at: 'asc' } },
      },
      orderBy: { updated_at: 'desc' },
    });
    const names = await accountNamesById(rows.map((order) => order.account_id));

    // Collect any Russian product names to translate dynamically
    const namesToTranslate = [];
    rows.forEach((order) => {
      let parsed = {};
      try { parsed = JSON.parse(order.raw_json); } catch { parsed = {}; }
      (parsed.products || []).forEach((prod) => {
        if (prod.name && /[а-яА-ЯёЁ]/.test(prod.name)) {
          namesToTranslate.push(prod.name);
        }
      });
    });

    const translatedMap = new Map();
    if (namesToTranslate.length > 0) {
      try {
        const uniqueNames = [...new Set(namesToTranslate)];
        const translations = await translateBulk(uniqueNames);
        uniqueNames.forEach((orig, idx) => {
          translatedMap.set(orig, translations[idx]);
        });
      } catch (err) {
        console.warn('[listOrdersPage] Dynamic translation error:', err.message);
      }
    }

    const orders = rows.map((order) => {
      let parsed = {};
      try { parsed = JSON.parse(order.raw_json); } catch { parsed = {}; }

      const compactParsed = {
        status: parsed.status,
        in_process_at: parsed.in_process_at,
        shipment_date: parsed.shipment_date,
        tpl_integration_type: parsed.tpl_integration_type,
        analytics_data: parsed.analytics_data ? {
          city: parsed.analytics_data.city,
          delivery_type: parsed.analytics_data.delivery_type,
          delivery_date_begin: parsed.analytics_data.delivery_date_begin,
          delivery_date_end: parsed.analytics_data.delivery_date_end,
        } : undefined,
        delivery_method: parsed.delivery_method ? {
          name: parsed.delivery_method.name,
          warehouse: parsed.delivery_method.warehouse,
          tpl_provider: parsed.delivery_method.tpl_provider,
        } : undefined,
        financial_data: parsed.financial_data ? {
          products: (parsed.financial_data.products || []).map((fp) => ({
            product_id: fp.product_id,
            price: fp.price,
            currency_code: fp.currency_code,
          })),
        } : undefined,
        products: (parsed.products || []).map((prod) => {
          const trans = translatedMap.get(prod.name);
          return {
            name: (trans && trans !== prod.name) ? trans : prod.name,
            _russian_name: (trans && trans !== prod.name) ? (prod._russian_name || prod.name) : prod._russian_name,
            offer_id: prod.offer_id,
            sku: prod.sku,
            quantity: prod.quantity,
            price: prod.price,
            primary_image: prod.primary_image,
          };
        }),
      };

      return {
        id: order.id,
        account_id: order.account_id,
        posting_number: order.posting_number,
        status: order.status || dbStatusFor(parsed.status, 'AWAITING_PACKAGING'),
        created_at: order.created_at,
        customer_name: order.customer_name,
        _accountName: names[order.account_id] || null,
        _parsed: compactParsed,
        _history: order.statusHistory,
      };
    });

    return {
      orders,
      filteredCount,
      page: current,
      pageSize: size,
      pageCount,
      hasMore: current * size < filteredCount,
    };
  };

  try {
    return await withCache(key, 45, load);
  } catch {
    return load();
  }
}
