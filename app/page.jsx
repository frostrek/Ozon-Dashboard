import Link from 'next/link';
import { prisma } from '../lib/prisma';
import DashboardPanels from './DashboardPanels';
import { withCache } from '../lib/cache/upstash';

export const dynamic = 'force-dynamic';

const TILES = [
  {
    key: 'AWAITING_PACKAGING',
    field: 'pack',
    label: 'Ready to Pack',
    colorClass: 'tile-amber',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="dash-kpi-realistic-icon" aria-hidden="true">
        <defs>
          <linearGradient id="kpiPackFlapL" x1="8" y1="12" x2="24" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <linearGradient id="kpiPackFlapR" x1="24" y1="12" x2="40" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
        </defs>
        <path d="M8 20L24 28V42L8 34V20Z" fill="#D97706" />
        <path d="M24 28L40 20V34L24 42V28Z" fill="#B45309" />
        <path d="M8 20L24 12L40 20L24 28L8 20Z" fill="#F59E0B" />
        <path d="M8 20L24 12L24 28L8 20Z" fill="url(#kpiPackFlapL)" />
        <path d="M40 20L24 12L24 28L40 20Z" fill="url(#kpiPackFlapR)" />
        <path d="M22 13L26 15V40L22 38V13Z" fill="#FEF3C7" opacity="0.95" />
        <path d="M22 13L26 15V19L22 17V13Z" fill="#FFFFFF" opacity="0.8" />
        <polygon points="12,25 18,28 18,34 12,31" fill="#FFFFFF" opacity="0.9" />
        <line x1="13.5" y1="27.5" x2="16.5" y2="29" stroke="#92400E" strokeWidth="1" strokeLinecap="round" />
        <line x1="13.5" y1="29.5" x2="16.5" y2="31" stroke="#92400E" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'AWAITING_DELIVERY',
    field: 'pickup',
    label: 'Waiting for Pickup',
    colorClass: 'tile-blue',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="dash-kpi-realistic-icon" aria-hidden="true">
        <defs>
          <linearGradient id="kpiVanBody" x1="6" y1="14" x2="29" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#189890" />
            <stop offset="100%" stopColor="#10756F" />
          </linearGradient>
          <linearGradient id="kpiVanCabin" x1="29" y1="17" x2="42" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#0F766E" />
          </linearGradient>
        </defs>
        <rect x="6" y="14" width="23" height="18" rx="2.5" fill="url(#kpiVanBody)" />
        <path d="M6 22H29V24.5H6V22Z" fill="#CCFBF1" opacity="0.45" />
        <path d="M29 17H35C36.3 17 37.5 17.8 38.1 19L41.3 24.5C41.8 25.3 42 26.1 42 27V30C42 31.1 41.1 32 40 32H29V17Z" fill="url(#kpiVanCabin)" />
        <path d="M30.5 19H34.8C35.5 19 36.1 19.4 36.5 20L39 24.5C39.2 24.8 39.3 25.1 39.3 25.5H30.5V19Z" fill="#E0F2FE" />
        <rect x="40.5" y="27" width="2" height="3" rx="1" fill="#FBBF24" />
        <rect x="40" y="30.5" width="2.5" height="1.8" rx="0.5" fill="#334155" />
        <circle cx="13" cy="32" r="5" fill="#1E293B" />
        <circle cx="13" cy="32" r="2.5" fill="#94A3B8" />
        <circle cx="13" cy="32" r="1.2" fill="#F8FAFC" />
        <circle cx="35" cy="32" r="5" fill="#1E293B" />
        <circle cx="35" cy="32" r="2.5" fill="#94A3B8" />
        <circle cx="35" cy="32" r="1.2" fill="#F8FAFC" />
      </svg>
    ),
  },
  {
    key: 'IN_TRANSIT',
    field: 'transit',
    label: 'On the Way',
    colorClass: 'tile-violet',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="dash-kpi-realistic-icon" aria-hidden="true">
        <defs>
          <linearGradient id="kpiTransitGrad" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <linearGradient id="kpiParcelGrad" x1="16" y1="20" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#C4B5FD" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="17" stroke="#EDE9FE" strokeWidth="2.5" strokeDasharray="3 3" />
        <path d="M11 24C11 16.82 16.82 11 24 11C28.5 11 32.5 13.3 34.8 17" stroke="url(#kpiTransitGrad)" strokeWidth="3" strokeLinecap="round" />
        <rect x="16" y="19" width="16" height="13" rx="2.5" fill="url(#kpiParcelGrad)" />
        <path d="M16 23.5H32" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.8" />
        <path d="M24 19V32" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.8" />
        <path d="M7 23H13" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M9 28H14" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <path d="M27 12L35 15L31 21L27 12Z" fill="#7C3AED" />
      </svg>
    ),
  },
  {
    key: 'DELIVERED',
    field: 'delivered',
    label: 'Delivered',
    colorClass: 'tile-green',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="dash-kpi-realistic-icon" aria-hidden="true">
        <defs>
          <linearGradient id="kpiDelivGrad" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="kpiDelivRim" x1="12" y1="8" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A7F3D0" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="17.5" fill="url(#kpiDelivGrad)" />
        <circle cx="24" cy="24" r="14.5" stroke="url(#kpiDelivRim)" strokeWidth="1.5" fill="none" opacity="0.75" />
        <path d="M12 20C13.5 14 18 10 24 10C29 10 33 13 35 17C32 14.5 28 13.5 24 13.5C19 13.5 14.5 16 12 20Z" fill="#FFFFFF" opacity="0.32" />
        <path d="M16 24.5L21.5 30L32 19" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
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

// Sparkline helper removed - clean KPI card design

async function getDashboardData() {
  return withCache('dashboard:page:v3', 30, async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date(today);
    month.setDate(month.getDate() - 30);

    const [accounts, orders, runs] = await Promise.all([
      prisma.account.findMany({ orderBy: { name: 'asc' } }),
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
        take: 3000,
      }),
      prisma.pipelineRun.findMany({
        orderBy: { start_time: 'desc' },
        select: { account_id: true, status: true, start_time: true },
        take: 100,
      }),
    ]);

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
      if (totals[order.status] !== undefined) {
        totals[order.status] += 1;
      }
      const created = new Date(order.created_at);
      if (created >= today) {
        addMoney(globalMoney.today, order.original_currency, order.original_price);
      }
      if (created >= month) {
        addMoney(globalMoney.month, order.original_currency, order.original_price);
      }
      const field = fieldFor[order.status];
      const slot = seriesIndex.get(dayKey(created));
      if (field && slot != null) series[slot][field] += 1;

      const bucket = buckets.get(order.account_id);
      if (!bucket) continue;
      bucket.savedOrders += 1;
      if (bucket.counts[order.status] !== undefined) {
        bucket.counts[order.status] += 1;
      }
      if (created >= today) {
        addMoney(bucket.money.today, order.original_currency, order.original_price);
      }
      if (created >= month) {
        addMoney(bucket.money.month, order.original_currency, order.original_price);
      }
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

    return {
      totals,
      globalMoney,
      series,
      accountRows,
      recent,
      totalSaved,
      totalReady,
      hasSeries,
    };
  });
}

export default async function Dashboard() {
  const {
    totals,
    globalMoney,
    series,
    accountRows,
    recent,
    totalSaved,
    totalReady,
    hasSeries,
  } = await getDashboardData();

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-header-left">
          <h1 className="dash-heading">Dashboard</h1>
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
          {TILES.map((tile) => (
            <Link key={tile.key} className={`dash-kpi-card ${tile.colorClass}`} href={`/orders?status=${tile.key}`}>
              <div className="dash-kpi-left">
                <span className="dash-kpi-label">{tile.label}</span>
                <strong className="dash-kpi-count">{totals[tile.key]}</strong>
              </div>
              <div className="dash-kpi-right">
                <span className="dash-kpi-icon-wrap">
                  {tile.icon}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {accountRows.length > 0 && (
        <div className="dash-banner">
          <svg className="dash-banner-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="dash-banner-text">
            <strong>{totalSaved}</strong> orders tracked across accounts &bull; <strong>{totalReady}</strong> awaiting packaging.
          </span>
          <Link className="dash-banner-link" href="/orders?status=AWAITING_PACKAGING">
            Process Packing Queue
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
