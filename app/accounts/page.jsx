import { prisma } from '../../lib/prisma';
import { redirect } from 'next/navigation';
import AccountForm from './AccountForm';
import AccountsList from './AccountsList';

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

async function deleteAccount(formData) {
  'use server';
  const id = formData.get('id');
  if (!id) redirect('/accounts');
  await prisma.account.delete({ where: { id: String(id) } });
  redirect('/accounts');
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

export default async function AccountsPage({ searchParams }) {
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

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

    const summed = processedToday._sum.orders_processed;

    return {
      id: account.id,
      name: account.name,
      clientId: account.client_id,
      active: account.active,
      ordersToday: summed == null ? 0 : summed,
      lastSync: formatSync(lastSuccess?.start_time || null),
      running: Boolean(running),
    };
  }));

  return (
    <div className="accounts-page">
      <header className="accounts-head">
        <div>
          <h1>Accounts</h1>
          <p>Manage your Ozon seller accounts. Add a client ID and API key, then run the pipeline for that account.</p>
        </div>
        <div className="dash-status-pill">
          <span className="dash-status-dot" />
          <span>Database connected</span>
        </div>
      </header>

      <AccountForm action={addAccount} saved={searchParams?.added === '1'} />
      <AccountsList rows={rows} deleteAction={deleteAccount} />
    </div>
  );
}
