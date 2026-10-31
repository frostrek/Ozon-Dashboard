import { prisma } from '../../lib/prisma';
import { listOrdersPage, orderStatusCounts, ORDER_PAGE_SIZE } from '../../lib/orders/listOrders';
import OrdersClient from './OrdersClient';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ searchParams }) {
  const statusFilter = searchParams?.status || 'ALL';
  const accountFilter = searchParams?.account || 'all';
  const dateFilter = searchParams?.date || 'all';
  const searchFilter = searchParams?.q || '';
  const pageSize = [50, 100].includes(Number(searchParams?.pageSize)) ? Number(searchParams.pageSize) : ORDER_PAGE_SIZE;
  const requestedPage = Math.max(1, Number(searchParams?.page) || 1);

  const [data, statusCounts, accounts] = await Promise.all([
    listOrdersPage({
      page: requestedPage,
      pageSize,
      status: statusFilter,
      account: accountFilter,
      date: dateFilter,
      q: searchFilter,
    }),
    orderStatusCounts(accountFilter),
    prisma.account.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <OrdersClient
      orders={data.orders}
      statusCounts={statusCounts}
      accounts={accounts}
      currentStatus={statusFilter}
      currentAccount={accountFilter}
      currentDate={dateFilter}
      currentSearch={searchFilter}
      filteredCount={data.filteredCount}
      currentPage={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      exportIds={data.orders.map((row) => row.id)}
    />
  );
}
