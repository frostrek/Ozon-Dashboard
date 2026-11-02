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

function serialize(product) {
  return {
    id: product.id,
    account_id: product.account_id,
    ozon_id: product.ozon_id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    price: product.price,
    old_price: product.old_price,
    currency: product.currency,
    stock: product.stock,
    reserved_stock: product.reserved_stock,
    fbo_stock: product.fbo_stock,
    rating: product.rating,
    content_rating: product.content_rating,
    status: product.status,
    status_name: product.status_name,
    variant_group_id: product.variant_group_id,
    ozon_created_at: product.ozon_created_at ? new Date(product.ozon_created_at).toISOString() : null,
    created_at: product.created_at ? new Date(product.created_at).toISOString() : null,
    updated_at: product.updated_at ? new Date(product.updated_at).toISOString() : null,
    images_json: product.images_json,
    attributes_json: product.attributes_json,
    account_name: product.account?.name || null,
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
  const key = `products:v4:${tab}:${account}:${list}:${q.trim().toLowerCase()}:p${current}:s${size}`;
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
  const key = `products:counts:v1:${account}`;
  return withCache(key, 45, async () => {
    const tabs = ['ALL', 'READY_FOR_SALE', 'ERROR', 'FOR_IMPROVEMENT', 'INACTIVE', 'ARCHIVE', 'LOW_STOCK', 'OUT_OF_STOCK'];
    const entries = await Promise.all(tabs.map(async (tab) => {
      const total = await prisma.product.count({ where: productWhere({ tab, account }) });
      return [tab, total];
    }));
    return Object.fromEntries(entries);
  });
}
