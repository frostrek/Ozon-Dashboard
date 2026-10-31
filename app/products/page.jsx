import { prisma } from '../../lib/prisma';
import { listProductsPage, productTabCounts, PRODUCT_PAGE_SIZE } from '../../lib/products/listProducts';
import ProductsClient from './ProductsClient';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }) {
  const page = Math.max(1, Number(searchParams?.page) || 1);
  const tab = searchParams?.tab || 'ALL';
  const account = searchParams?.account || 'all';
  const list = searchParams?.list || 'all';
  const q = searchParams?.q || '';

  const [data, counts, accounts] = await Promise.all([
    listProductsPage({ page, pageSize: PRODUCT_PAGE_SIZE, tab, account, list, q }),
    productTabCounts(account),
    prisma.account.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <ProductsClient
      initialProducts={data.products}
      initialTotal={data.total}
      initialPage={data.page}
      initialPageCount={data.pageCount}
      initialCounts={counts}
      initialTab={tab}
      initialAccount={account}
      initialList={list}
      initialQuery={q}
      accounts={accounts}
    />
  );
}
