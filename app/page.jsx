import Link from 'next/link';
import { prisma } from '../lib/prisma';
import DashboardPanels from './DashboardPanels';

export const dynamic = 'force-dynamic';

const TILES = [
  {
    key: 'AWAITING_PACKAGING',
    field: 'pack',
    label: 'Ready to Pack',
    colorClass: 'tile-amber',
    icon: (
      <>
        <path d="M6 7h12l-1 13H7L6 7z" />
        <path d="M9 7V5a3 3 0 0 1 6 0v2" />
      </>
    ),
  },
  {
    key: 'AWAITING_DELIVERY',
    field: 'pickup',
    label: 'Waiting for Pickup',
    colorClass: 'tile-blue',
    icon: (
      <>
        <path d="M3 7h11v8H3z" />
        <path d="M14 10h4l3 3v2h-7z" />
        <path d="M7 18a1.5 1.5 0 1 0 0.01 0" />
        <path d="M17 18a1.5 1.5 0 1 0 0.01 0" />
      </>
    ),
  },
  {
    key: 'IN_TRANSIT',
    field: 'transit',
    label: 'On the Way',
    colorClass: 'tile-violet',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </>
    ),
  },
  {
    key: 'DELIVERED',
    field: 'delivered',
    label: 'Delivered',
    colorClass: 'tile-green',
    icon: <path d="M20 7l-9 9-4-4" />,
  },
];

const STATUS_LABEL = {
  AWAITING_PACKAGING: 'Ready to pack',
  AWAITING_DELIVERY: 'Waiting for pickup',
  IN_TRANSIT: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  ARBITRATION: 'Arbitration',
};

function addMoney(bucket, currency, amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return;
  const code = currency || 'USD';
  bucket[code] = (bucket[code] || 0) + amount;
}

function formatMoney(amounts) {
  const entries = Object.entries(amounts || {});
  if (!entries.length) return '—';
  return entries.map(([currency, amount]) => {
    const symbol = currency === 'RUB' ? '₽' : currency === 'EUR' ? '€' : currency === 'INR' ? '₹' : '$';
    const value = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${value}`;
  }).join(' · ');
}

function dayKey(date) {
  const value = new Date(date);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function runLabel(run) {
  if (!run) return 'No run yet';
  const when = new Date(run.start_time).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (run.status === 'success') return `Finished · ${when}`;
  if (run.status === 'running') return 'In progress';
  if (run.status === 'cancelled') return `Stopped · ${when}`;
  return `Did not finish · ${when}`;
}

function sparkPath(values) {
  if (!values.some((value) => value > 0)) return '';
  const max = Math.max(...values, 1);
  const width = 72;
  const height = 22;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values.map((value, index) => {
    const x = index * step;
    const y = height - ((value / max) * (height - 2)) - 1;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

export default async function Dashboard() {
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' } });
  const [orders, runs] = await Promise.all([
    prisma.order.findMany({
      select: {
        id: true,
        account_id: true,
        posting_number: true,
        created_at: true,
        original_price: true,
        original_currency: true,
        status: true,
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.pipelineRun.findMany({
      orderBy: { start_time: 'desc' },
      select: { account_id: true, status: true, start_time: true },
    }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = new Date(today);
  month.setDate(month.getDate() - 30);

  const lastRunByAccount = new Map();
  for (const run of runs) {
    if (run.account_id && !lastRunByAccount.has(run.account_id)) lastRunByAccount.set(run.account_id, run);
  }

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const buckets = new Map(accounts.map((account) => [account.id, {
    counts: { AWAITING_PACKAGING: 0, AWAITING_DELIVERY: 0, IN_TRANSIT: 0, DELIVERED: 0 },
    money: { today: {}, month: {} },
    savedOrders: 0,
  }]));
  const totals = { AWAITING_PACKAGING: 0, AWAITING_DELIVERY: 0, IN_TRANSIT: 0, DELIVERED: 0 };
  const globalMoney = { today: {}, month: {} };

  const series = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    series.push({
      key: dayKey(date),
      label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      pack: 0,
      pickup: 0,
      transit: 0,
      delivered: 0,
    });
  }
  const seriesIndex = new Map(series.map((point, index) => [point.key, index]));
  const fieldFor = {
    AWAITING_PACKAGING: 'pack',
    AWAITING_DELIVERY: 'pickup',
    IN_TRANSIT: 'transit',
    DELIVERED: 'delivered',
  };

  for (const order of orders) {
    const bucket = buckets.get(order.account_id);
    if (!bucket) continue;
    bucket.savedOrders += 1;
    if (bucket.counts[order.status] !== undefined) {
      bucket.counts[order.status] += 1;
      totals[order.status] += 1;
    }
    const created = new Date(order.created_at);
    if (created >= today) {
      addMoney(bucket.money.today, order.original_currency, order.original_price);
      addMoney(globalMoney.today, order.original_currency, order.original_price);
    }
    if (created >= month) {
      addMoney(bucket.money.month, order.original_currency, order.original_price);
      addMoney(globalMoney.month, order.original_currency, order.original_price);
    }
    const field = fieldFor[order.status];
    const slot = seriesIndex.get(dayKey(created));
    if (field && slot != null) series[slot][field] += 1;
  }

  const accountRows = accounts.map((account) => {
    const bucket = buckets.get(account.id);
    const lastRun = lastRunByAccount.get(account.id) || null;
    return {
      id: account.id,
      name: account.name,
      active: account.active,
      counts: bucket.counts,
      savedOrders: bucket.savedOrders,
      todayMoney: formatMoney(bucket.money.today),
      monthMoney: formatMoney(bucket.money.month),
      runText: runLabel(lastRun),
      runStatus: lastRun?.status || '',
    };
  });

  const recent = orders.slice(0, 8).map((order) => ({
    id: order.id,
    posting: order.posting_number,
    account: accountNames.get(order.account_id) || '—',
    status: order.status,
    statusLabel: STATUS_LABEL[order.status] || order.status,
    created: new Date(order.created_at).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    amount: formatMoney(
      typeof order.original_price === 'number'
        ? { [order.original_currency || 'USD']: order.original_price }
        : {},
    ),
  }));

  const totalSaved = accountRows.reduce((sum, account) => sum + account.savedOrders, 0);
  const totalReady = totals.AWAITING_PACKAGING;
  const hasSeries = series.some((point) => point.pack || point.pickup || point.transit || point.delivered);

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-header-left">
          <span className="dash-eyebrow">Fulfillment overview</span>
          <h1 className="dash-heading">Dashboard</h1>
          <p className="dash-subheading">Track fulfillment performance and manage your orders in one place.</p>
        </div>
        <div className="dash-header-right">
          <div className="dash-status-pill">
            <span className="dash-status-dot" />
            <span>System online</span>
          </div>
          <span className="dash-date">
            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </header>

      {accountRows.length === 0 && (
        <section className="dash-empty-state">
          <h2>Add an account to begin</h2>
          <p>The dashboard fills in after an Ozon seller account is saved.</p>
          <Link className="dash-btn-primary" href="/accounts">Add account</Link>
        </section>
      )}

      {accountRows.length > 0 && (
        <div className="dash-kpi-grid">
          {TILES.map((tile) => {
            const path = sparkPath(series.map((point) => point[tile.field]));
            return (
              <Link key={tile.key} className={`dash-kpi-card ${tile.colorClass}`} href={`/orders?status=${tile.key}`}>
                <div className="dash-kpi-top">
                  <span className="dash-kpi-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">{tile.icon}</svg>
                  </span>
                  {path ? (
                    <svg className="dash-spark" viewBox="0 0 72 22" aria-hidden="true">
                      <path d={path} />
                    </svg>
                  ) : (
                    <svg className="dash-kpi-arrow" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  )}
                </div>
                <p className="dash-kpi-label">{tile.label}</p>
                <strong className="dash-kpi-count">{totals[tile.key]}</strong>
              </Link>
            );
          })}
        </div>
      )}

      {accountRows.length > 0 && (
        <div className="dash-banner">
          <svg className="dash-banner-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span className="dash-banner-text">
            {totalSaved} saved order{totalSaved === 1 ? '' : 's'}. {totalReady} ready to pack.
          </span>
          <Link className="dash-banner-link" href="/orders?status=AWAITING_PACKAGING">
            View saved orders
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </Link>
        </div>
      )}

      {accountRows.length > 0 && (
        <DashboardPanels
          accounts={accountRows}
          series={hasSeries ? series : []}
          recent={recent}
          todayMoney={formatMoney(globalMoney.today)}
          monthMoney={formatMoney(globalMoney.month)}
        />
      )}
    </div>
  );
}
