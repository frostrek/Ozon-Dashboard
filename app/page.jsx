import Link from 'next/link';
import { prisma } from '../lib/prisma';

export const dynamic = 'force-dynamic';

const TILES = [
  { key: 'AWAITING_PACKAGING', label: 'Ready to pack', className: 'dash-tile-pack', icon: <path d="M6 7h12l-1 13H7L6 7zM9 7V5a3 3 0 0 1 6 0v2" /> },
  { key: 'AWAITING_DELIVERY', label: 'Waiting for pickup', className: 'dash-tile-ship', icon: <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a1.5 1.5 0 1 0 0.01 0M17 18a1.5 1.5 0 1 0 0.01 0" /> },
  { key: 'IN_TRANSIT', label: 'On the way', className: 'dash-tile-transit', icon: <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></> },
  { key: 'DELIVERED', label: 'Delivered', className: 'dash-tile-done', icon: <path d="M20 7l-9 9-4-4" /> },
];

function addMoney(bucket, currency, amount) {
  if (typeof amount !== 'number') return;
  const code = currency || 'USD';
  bucket[code] = (bucket[code] || 0) + amount;
}

function formatMoney(amounts) {
  const entries = Object.entries(amounts);
  if (entries.length === 0) return '—';
  return entries.map(([currency, amount]) => {
    const symbol = currency === 'RUB' ? '₽' : currency === 'EUR' ? '€' : '$';
    const value = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${value}`;
  }).join(' · ');
}

function runLabel(run) {
  if (!run) return 'No run yet. Start one when you want fresh orders.';
  const when = new Date(run.start_time).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (run.status === 'success') return `Last run finished · ${when}`;
  if (run.status === 'running') return 'A run is in progress';
  if (run.status === 'cancelled') return `Last run was stopped · ${when}`;
  return `Last run did not finish · ${when}`;
}

export default async function Dashboard() {
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });
  const orders = await prisma.order.findMany({
    select: { account_id: true, created_at: true, original_price: true, original_currency: true, status: true },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = new Date(today);
  month.setDate(month.getDate() - 30);

  const accountStats = await Promise.all(accounts.map(async (account) => {
    const counts = {
      AWAITING_PACKAGING: 0,
      AWAITING_DELIVERY: 0,
      IN_TRANSIT: 0,
      DELIVERED: 0,
    };
    const money = { today: {}, month: {} };
    let savedOrders = 0;

    for (const order of orders) {
      if (order.account_id !== account.id) continue;
      savedOrders += 1;
      if (counts[order.status] !== undefined) counts[order.status] += 1;
      const created = new Date(order.created_at);
      if (created >= today) addMoney(money.today, order.original_currency, order.original_price);
      if (created >= month) addMoney(money.month, order.original_currency, order.original_price);
    }

    const lastRun = await prisma.pipelineRun.findFirst({
      where: { account_id: account.id },
      orderBy: { start_time: 'desc' },
      select: { status: true, start_time: true },
    });

    return {
      id: account.id,
      name: account.name,
      active: account.active,
      counts,
      savedOrders,
      money,
      lastRun,
      ready: counts.AWAITING_PACKAGING,
    };
  }));

  return (
    <div className="dash">
      <header className="page-head">
        <h1>Dashboard</h1>
        <p className="page-lead">See what each account still has open, then run the pipeline when you want a fresh check from Ozon.</p>
      </header>

      {accountStats.length === 0 && (
        <section className="stat-card dash-empty">
          <h2>Add an account to begin</h2>
          <p>The dashboard fills in after an Ozon seller account is saved.</p>
          <Link className="download-button" href="/accounts">Add account</Link>
        </section>
      )}

      <div className="dash-list">
        {accountStats.map((account) => (
          <article className="stat-card dash-account" key={account.id}>
            <div className="dash-account-head">
              <div className="dash-id">
                <span className="dash-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                </span>
                <div>
                  <div className="dash-name-row">
                    <h2>{account.name}</h2>
                    <span className={account.active ? 'dash-badge dash-badge-on' : 'dash-badge'}>
                      {account.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p>{runLabel(account.lastRun)}</p>
                </div>
              </div>
              <div className="dash-actions">
                <Link className="dash-primary" href={`/pipeline?accountId=${account.id}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                  Run pipeline
                </Link>
                <Link className="dash-outline" href={`/orders?account=${account.id}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  View orders
                </Link>
              </div>
            </div>

            <div className="dash-tiles">
              {TILES.map((tile) => (
                <Link
                  className={`dash-tile ${tile.className}`}
                  key={tile.key}
                  href={`/orders?account=${account.id}&status=${tile.key}`}
                >
                  <span className="dash-tile-top">
                    <svg viewBox="0 0 24 24" aria-hidden="true">{tile.icon}</svg>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  </span>
                  <p>{tile.label}</p>
                  <strong>{account.counts[tile.key]}</strong>
                </Link>
              ))}
            </div>

            <p className="dash-note">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
              <span>
                {account.ready > 0
                  ? `${account.ready} saved order${account.ready === 1 ? ' is' : 's are'} ready to pack.`
                  : 'Nothing is waiting to be packed in the saved orders.'}
                {account.savedOrders === 0
                  ? ' A finished run is what fills these numbers.'
                  : ` ${account.savedOrders} order${account.savedOrders === 1 ? '' : 's'} saved.`}
              </span>
            </p>

            <div className="dash-money">
              <div>
                <span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                  Today
                </span>
                <strong>{formatMoney(account.money.today)}</strong>
              </div>
              <div>
                <span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                  Last 30 days
                </span>
                <strong>{formatMoney(account.money.month)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
