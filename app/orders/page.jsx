import { prisma } from '../../lib/prisma';
import { listOrdersPage, orderStatusCounts, ORDER_PAGE_SIZE } from '../../lib/orders/listOrders';
import OrdersClient from './OrdersClient';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ searchParams }) {
  const statusFilter = searchParams?.status || 'ALL';
  const accountFilter = searchParams?.account || 'all';
  const dateFilter = searchParams?.date || 'all';
  const searchFilter = searchParams?.q || '';

  const [data, statusCounts, accounts] = await Promise.all([
    listOrdersPage({
      page: 1,
      pageSize: ORDER_PAGE_SIZE,
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
    />
  );
}
