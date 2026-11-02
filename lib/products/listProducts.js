import { prisma } from '../prisma';
import { withCache } from '../cache/upstash';

export const PRODUCT_PAGE_SIZE = 100;
const PRODUCT_SELECT = {
  id: true,
  account_id: true,
  ozon_id: true,
  sku: true,
  name: true,
  brand: true,
  price: true,
  old_price: true,
  currency: true,
  stock: true,
  reserved_stock: true,
  fbo_stock: true,
  rating: true,
  content_rating: true,
  status: true,
  status_name: true,
  variant_group_id: true,
  ozon_created_at: true,
  created_at: true,
  updated_at: true,
  images_json: true,
  attributes_json: true,
  account: { select: { name: true } },
};

function appendAnd(where, clause) {
  where.AND = [...(where.AND || []), clause];
}

export function productWhere({ tab = 'ALL', account = 'all', list = 'all', q = '' } = {}) {
  const where = {};
  if (account && account !== 'all') where.account_id = account;

  if (tab === 'READY_FOR_SALE') {
    where.status = 'ACTIVE';
    where.stock = { gt: 0 };
  } else if (tab === 'ERROR') {
    where.status = 'ERROR';
  } else if (tab === 'FOR_IMPROVEMENT') {
    where.content_rating = { lt: 50 };
  } else if (tab === 'INACTIVE') {
    where.status = 'ACTIVE';
    where.stock = 0;
  } else if (tab === 'ARCHIVE') {
    where.status = 'ARCHIVED';
  } else if (tab === 'LOW_STOCK') {
    where.status = { not: 'ARCHIVED' };
    where.stock = { lt: 5 };
  } else if (tab === 'OUT_OF_STOCK') {
    where.status = { not: 'ARCHIVED' };
    where.stock = 0;
  }

  if (list === 'listed') {
    appendAnd(where, { status: { not: 'ARCHIVED' } });
  } else if (list === 'selling') {
    appendAnd(where, {
      OR: [
        { status: 'ACTIVE' },
        { status_name: 'Продается' },
      ],
    });
  } else if (list === 'out') {
    where.status = { not: 'ARCHIVED' };
    where.stock = 0;
  } else if (list === 'error') {
    where.status = 'ERROR';
  }

  const needle = String(q || '').trim();
  if (needle) {
    const search = [
      { name: { contains: needle } },
      { sku: { contains: needle } },
      { ozon_id: { contains: needle } },
      { brand: { contains: needle } },
    ];
    where.AND = [...(where.AND || []), { OR: search }];
  }
  return where;
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function jsonText(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function serialize(product) {
  return {
    id: String(product.id || ''),
    account_id: String(product.account_id || ''),
    ozon_id: product.ozon_id == null ? '' : String(product.ozon_id),
    sku: product.sku == null ? '' : String(product.sku),
    name: product.name == null ? '' : String(product.name),
    brand: product.brand == null ? null : String(product.brand),
    price: num(product.price, 0),
    old_price: num(product.old_price),
    currency: product.currency == null ? 'USD' : String(product.currency),
    stock: num(product.stock, 0) ?? 0,
    reserved_stock: num(product.reserved_stock, 0) ?? 0,
    fbo_stock: num(product.fbo_stock, 0) ?? 0,
    rating: num(product.rating),
    content_rating: num(product.content_rating),
    status: product.status == null ? '' : String(product.status),
    status_name: product.status_name == null ? null : String(product.status_name),
    variant_group_id: product.variant_group_id == null ? null : String(product.variant_group_id),
    ozon_created_at: iso(product.ozon_created_at),
    created_at: iso(product.created_at),
    updated_at: iso(product.updated_at),
    images_json: jsonText(product.images_json),
    attributes_json: jsonText(product.attributes_json),
    account_name: product.account?.name || product.account_name || null,
  };
}

export async function listProductsPage({
  page = 1,
  pageSize = PRODUCT_PAGE_SIZE,
  tab = 'ALL',
  account = 'all',
  list = 'all',
  q = '',
} = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || PRODUCT_PAGE_SIZE));
  const current = Math.max(1, Number(page) || 1);
  const where = productWhere({ tab, account, list, q });
  const key = `products:v5:${tab}:${account}:${list}:${q.trim().toLowerCase()}:p${current}:s${size}`;
  const orderBy = list === 'listed'
    ? [{ ozon_created_at: 'desc' }, { created_at: 'desc' }]
    : [{ updated_at: 'desc' }, { created_at: 'desc' }];

  const load = async () => {
    const total = await prisma.product.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / size));
    if (current > pageCount || total === 0) {
      return {
        products: [],
        total,
        page: current,
        pageSize: size,
        pageCount,
        hasMore: false,
      };
    }
    const rows = await prisma.product.findMany({
      where,
      orderBy,
      skip: (current - 1) * size,
      take: size,
      select: PRODUCT_SELECT,
    });
    return {
      products: rows.map(serialize),
      total,
      page: current,
      pageSize: size,
      pageCount,
      hasMore: current * size < total,
    };
  };

  try {
    return await withCache(key, 45, load);
  } catch {
    return load();
  }
}

export async function productTabCounts(account = 'all') {
  const key = `products:counts:v2:${account}`;
  const load = async () => {
    const tabs = ['ALL', 'READY_FOR_SALE', 'ERROR', 'FOR_IMPROVEMENT', 'INACTIVE', 'ARCHIVE', 'LOW_STOCK', 'OUT_OF_STOCK'];
    const entries = await Promise.all(tabs.map(async (tab) => {
      const total = await prisma.product.count({ where: productWhere({ tab, account }) });
      return [tab, Number(total) || 0];
    }));
    return Object.fromEntries(entries);
  };
  try {
    return await withCache(key, 45, load);
  } catch {
    return load();
  }
}
