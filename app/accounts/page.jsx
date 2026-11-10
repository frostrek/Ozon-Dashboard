import { prisma } from '../../lib/prisma';
import { redirect } from 'next/navigation';
import AccountsClient from './AccountsClient';
import { withCache } from '../../lib/cache/upstash';

export const dynamic = 'force-dynamic';

async function addAccount(_previous, formData) {
  'use server';
  const name = String(formData.get('name') || '').trim();
  const client_id = String(formData.get('client_id') || '').trim();
  const api_key = String(formData.get('api_key') || '').trim();

  if (!name || !client_id || !api_key) {
    return { error: 'Account name, client ID, and API key are required.' };
  }

  try {
    await prisma.account.create({ data: { name, client_id, api_key, active: true } });
  } catch {
    return { error: 'The account could not be saved. Check the values and try again.' };
  }

  redirect('/accounts?added=1');
}

function formatSync(value) {
  if (!value) return 'Never synced';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function getAccountsOverview() {
  return withCache('accounts:overview:v2', 30, async () => {
    const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let totalOrdersToday = 0;
    let activeAccounts = 0;
    let anyRunning = false;

    const rows = await Promise.all(accounts.map(async (account) => {
      const [processedToday, lastSuccess, running] = await Promise.all([
        prisma.pipelineRun.aggregate({
          _sum: { orders_processed: true },
          where: { account_id: account.id, start_time: { gte: startOfToday } },
        }),
        prisma.pipelineRun.findFirst({
          where: { account_id: account.id, status: 'success' },
          orderBy: { start_time: 'desc' },
          select: { start_time: true },
        }),
        prisma.pipelineRun.findFirst({
          where: { account_id: account.id, status: 'running' },
          select: { id: true },
        }),
      ]);

      const summed = processedToday._sum.orders_processed || 0;
      totalOrdersToday += summed;
      if (account.active) activeAccounts += 1;
      if (running) anyRunning = true;

      return {
        id: account.id,
        name: account.name,
        clientId: account.client_id,
        active: account.active,
        ordersToday: summed,
        lastSync: formatSync(lastSuccess?.start_time || null),
        running: Boolean(running),
      };
    }));

    const stats = {
      totalAccounts: accounts.length,
      activeAccounts,
      totalOrdersToday,
      anyRunning,
    };

    return { rows, stats };
  });
}

export default async function AccountsPage({ searchParams }) {
  const { rows, stats } = await getAccountsOverview();

  return (
    <div className="accounts-page">
      <AccountsClient
        rows={rows}
        stats={stats}
        action={addAccount}
        saved={searchParams?.added === '1'}
      />
    </div>
  );
}
