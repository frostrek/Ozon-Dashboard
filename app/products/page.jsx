import { prisma } from '../../lib/prisma';
import { listProductsPage, productTabCounts, PRODUCT_PAGE_SIZE } from '../../lib/products/listProducts';
import ProductsClient from './ProductsClient';
import FriendlyError from '../components/FriendlyError';
import { toPlain } from '../../lib/toPlain';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }) {
  const tab = searchParams?.tab || 'ALL';
  const account = searchParams?.account || 'all';
  const list = searchParams?.list || 'all';
  const q = searchParams?.q || '';

  try {
    const [data, counts, accountRows] = await Promise.all([
      listProductsPage({ page: 1, pageSize: PRODUCT_PAGE_SIZE, tab, account, list, q }),
      productTabCounts(account),
      prisma.account.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const accounts = toPlain(accountRows) || [];
    if (!accounts.length) {
      return <FriendlyError kind="no-account" />;
    }

    return (
      <ProductsClient
        initialProducts={toPlain(data.products) || []}
        initialTotal={Number(data.total) || 0}
        initialHasMore={Boolean(data.hasMore)}
        initialCounts={toPlain(counts) || {}}
        initialTab={tab}
        initialAccount={account}
        initialList={list}
        initialQuery={q}
        accounts={accounts}
      />
    );
  } catch (error) {
    console.error('[products-page]', error);
    return <FriendlyError error={error} />;
  }
}
