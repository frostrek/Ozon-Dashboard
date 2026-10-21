import Link from 'next/link';
import { prisma } from '../../lib/prisma';
import { redirect } from 'next/navigation';
import AccountForm from './AccountForm';
import DeleteAccount from './DeleteAccount';

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
  return new Date(value).toLocaleString('en-IN');
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
      lastSuccess: lastSuccess?.start_time || null,
      running: Boolean(running),
    };
  }));

  return (
    <div className="accounts-page">
      <header className="page-head">
        <h1>Accounts</h1>
        <p className="page-lead">Manage your Ozon seller accounts. Add a client ID and API key, then run the pipeline for that account.</p>
      </header>

      <AccountForm action={addAccount} saved={searchParams?.added === '1'} />

      <section className="stat-card accounts-table-card">
        <div className="accounts-table-head">
          <h2>Accounts</h2>
          <p>Connected seller accounts and their current status.</p>
        </div>

        {rows.length === 0 ? (
          <p className="empty-cell">No accounts yet. Use the form above to add one.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table accounts-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Client ID</th>
                  <th>Status</th>
                  <th>Last sync</th>
                  <th>Orders today</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((account) => (
                  <tr key={account.id}>
                    <td className="accounts-name">{account.name}</td>
                    <td className="run-id">{account.clientId}</td>
                    <td>
                      <span className={account.active ? 'dash-badge dash-badge-on' : 'dash-badge'}>
                        {account.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatSync(account.lastSuccess)}</td>
                    <td>{account.ordersToday}</td>
                    <td>
                      <div className="accounts-actions">
                        {account.running ? (
                          <Link className="dash-outline accounts-run" href={`/pipeline?accountId=${account.id}`} aria-disabled="true">
                            Running
                          </Link>
                        ) : (
                          <Link className="dash-outline accounts-run" href={`/pipeline?accountId=${account.id}`}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                            Run
                          </Link>
                        )}
                        <DeleteAccount action={deleteAccount} id={account.id} name={account.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
