import { prisma } from '../../lib/prisma';
import OrdersClient from './OrdersClient';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ searchParams }) {
  const statusFilter  = searchParams?.status  || 'ALL';
  const accountFilter = searchParams?.account || 'all';
  const dateFilter    = searchParams?.date    || 'all';
  const searchFilter  = searchParams?.q       || '';

  // Calculate status counts respecting the account filter
  const STATUS_TABS = ['ALL', 'AWAITING_PACKAGING', 'AWAITING_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
  const statusCounts = {};
  const baseWhere = accountFilter !== 'all' ? { account_id: accountFilter } : {};
  statusCounts._total = await prisma.order.count({ where: baseWhere });
  for (const status of STATUS_TABS.slice(1)) {
    statusCounts[status] = await prisma.order.count({ where: { ...baseWhere, status } });
  }

  // Build Prisma WHERE clause
  const where = {};
  if (statusFilter !== 'ALL') where.status = statusFilter;
  if (accountFilter !== 'all') where.account_id = accountFilter;
  
  if (dateFilter !== 'all') {
      const now = new Date();
      if (dateFilter === 'today') {
          where.created_at = { gte: new Date(now.setHours(0,0,0,0)) };
      } else if (dateFilter === 'yesterday') {
          const start = new Date(now); start.setDate(start.getDate()-1); start.setHours(0,0,0,0);
          const end   = new Date(now); end.setDate(end.getDate()-1); end.setHours(23,59,59,999);
          where.created_at = { gte: start, lte: end };
      } else if (dateFilter === 'week') {
          const start = new Date(now); start.setDate(start.getDate()-7); start.setHours(0,0,0,0);
          where.created_at = { gte: start };
      }
  }

  if (searchFilter) {
      where.OR = [
          { posting_number: { contains: searchFilter } }, // SQLite contains is case-insensitive
          { raw_json: { contains: searchFilter } } // Extremely basic search against raw JSON text for SKU constraints
      ];
  }

  // Fetch orders
  const dbOrders = await prisma.order.findMany({
    where,
    take: 250,
    include: {
      account: true,
      statusHistory: { orderBy: { changed_at: 'asc' } }
    },
    orderBy: { updated_at: 'desc' }
  });

  const accounts = await prisma.account.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  // Normalize data for client to avoid giant strings
  const clientOrders = dbOrders.map(o => {
      let parsed = {};
      try { parsed = JSON.parse(o.raw_json); } catch(e) {}
      return {
          id: o.id,
          account_id: o.account_id,
          posting_number: o.posting_number,
          status: o.status,
          created_at: o.created_at,
          customer_name: o.customer_name,
          _accountName: o.account.name,
          _parsed: parsed,
          _history: o.statusHistory
      };
  });

  return (
    <OrdersClient 
       orders={clientOrders} 
       statusCounts={statusCounts} 
       accounts={accounts}
       currentStatus={statusFilter}
       currentAccount={accountFilter}
       currentDate={dateFilter}
       currentSearch={searchFilter}
    />
  );
}
