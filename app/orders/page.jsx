import { prisma } from '../../lib/prisma';
import { listOrdersPage, orderStatusCounts, ORDER_PAGE_SIZE } from '../../lib/orders/listOrders';
import OrdersClient from './OrdersClient';
import FriendlyError from '../components/FriendlyError';
import { toPlain } from '../../lib/toPlain';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ searchParams }) {
  const statusFilter = searchParams?.status || 'ALL';
  const accountFilter = searchParams?.account || 'all';
  const dateFilter = searchParams?.date || 'all';
  const fromFilter = searchParams?.from || '';
  const toFilter = searchParams?.to || '';
  const fromTimeFilter = searchParams?.fromTime || '';
  const toTimeFilter = searchParams?.toTime || '';
  const searchFilter = searchParams?.q || '';

  try {
    const [data, statusCounts, accounts] = await Promise.all([
      listOrdersPage({
        page: 1,
        pageSize: ORDER_PAGE_SIZE,
        status: statusFilter,
        account: accountFilter,
        date: dateFilter,
        from: fromFilter,
        to: toFilter,
        fromTime: fromTimeFilter,
        toTime: toTimeFilter,
        q: searchFilter,
      }),
      orderStatusCounts(accountFilter),
      prisma.account.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const safeAccounts = (toPlain(accounts) || []).map((row) => ({
      id: String(row.id),
      name: String(row.name || 'Untitled account'),
    }));
    if (!safeAccounts.length) {
      return <FriendlyError kind="no-account" />;
    }

    return (
      <OrdersClient
        orders={toPlain(data.orders) || []}
        statusCounts={toPlain(statusCounts) || {}}
        accounts={safeAccounts}
        currentStatus={statusFilter}
        currentAccount={accountFilter}
        currentDate={dateFilter}
        currentFrom={fromFilter}
        currentTo={toFilter}
        currentFromTime={fromTimeFilter}
        currentToTime={toTimeFilter}
        currentSearch={searchFilter}
        filteredCount={data.filteredCount}
      />
    );
  } catch (error) {
    console.error('[orders-page]', error);
    return (
      <FriendlyError
        kind="page"
        message="Orders could not be loaded from the database."
        digest={error?.digest ? String(error.digest) : ''}
      />
    );
  }
}
