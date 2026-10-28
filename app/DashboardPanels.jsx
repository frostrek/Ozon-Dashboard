'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const LINES = [
  { key: 'pack', name: 'Ready to pack', color: '#2563EB' },
  { key: 'pickup', name: 'Waiting for pickup', color: '#60A5FA' },
  { key: 'transit', name: 'On the way', color: '#8B5CF6' },
  { key: 'delivered', name: 'Delivered', color: '#10B981' },
];

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <p key={item.dataKey}>
          <span style={{ background: item.color }} />
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  );
}

function runClass(status) {
  if (status === 'success') return 'dash-run-badge dash-run-badge-run-ok';
  if (status === 'running') return 'dash-run-badge dash-run-badge-run-active';
  if (status === 'cancelled') return 'dash-run-badge dash-run-badge-run-muted';
  if (status) return 'dash-run-badge dash-run-badge-run-warn';
  return 'dash-run-badge dash-run-badge-run-muted';
}

export default function DashboardPanels({ accounts, series, recent, todayMoney, monthMoney }) {
  const [days, setDays] = useState(14);
  const [openId, setOpenId] = useState('');
  const points = series.slice(-days);

  return (
    <>
      <section className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <h2>Accounts</h2>
            <p>Connection is whether the seller account is active. Pipeline is the last run.</p>
          </div>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-accounts">
            <thead>
              <tr>
                <th>Account</th>
                <th>Connection</th>
                <th>Ready</th>
                <th>Pickup</th>
                <th>On the way</th>
                <th>Delivered</th>
                <th>Last pipeline</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <Fragment key={account.id}>
                  <tr>
                    <td>
                      <button type="button" className="dash-account-name" onClick={() => setOpenId(openId === account.id ? '' : account.id)} aria-expanded={openId === account.id}>
                        {account.name}
                      </button>
                    </td>
                    <td>
                      <span className={account.active ? 'dash-ac-badge dash-ac-badge-on' : 'dash-ac-badge'}>
                        {account.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td><Link className="dash-count" href={`/orders?account=${account.id}&status=AWAITING_PACKAGING`}>{account.counts.AWAITING_PACKAGING}</Link></td>
                    <td><Link className="dash-count dash-count-blue" href={`/orders?account=${account.id}&status=AWAITING_DELIVERY`}>{account.counts.AWAITING_DELIVERY}</Link></td>
                    <td><Link className="dash-count dash-count-violet" href={`/orders?account=${account.id}&status=IN_TRANSIT`}>{account.counts.IN_TRANSIT}</Link></td>
                    <td><Link className="dash-count dash-count-green" href={`/orders?account=${account.id}&status=DELIVERED`}>{account.counts.DELIVERED}</Link></td>
                    <td>
                      <span className={runClass(account.runStatus)}>{account.runText}</span>
                    </td>
                    <td>
                      <div className="dash-row-actions">
                        <Link className="dash-btn-primary" href={`/pipeline?accountId=${account.id}`}>Run pipeline</Link>
                        <Link className="dash-btn-secondary" href={`/orders?account=${account.id}`}>View orders</Link>
                      </div>
                    </td>
                  </tr>
                  {openId === account.id && (
                    <tr className="dash-account-detail">
                      <td colSpan={8}>
                        <span>{account.savedOrders} saved order{account.savedOrders === 1 ? '' : 's'}</span>
                        <span>Today {account.todayMoney}</span>
                        <span>Last 30 days {account.monthMoney}</span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dash-split">
        <article className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <h2>Fulfillment trends</h2>
              <p>Orders saved in each stage, by the day they were created.</p>
            </div>
            <div className="dash-range" role="group" aria-label="Chart period">
              {[7, 14].map((value) => (
                <button key={value} type="button" className={days === value ? 'is-on' : ''} onClick={() => setDays(value)}>
                  {value} days
                </button>
              ))}
            </div>
          </div>
          {points.length === 0 ? (
            <p className="dash-empty-chart">No saved orders in this window, so there is no trend to draw.</p>
          ) : (
            <div className="dash-chart">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#E2EAF5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {LINES.map((line) => (
                    <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="dash-money-row">
            <div>
              <span>Today</span>
              <strong>{todayMoney}</strong>
            </div>
            <div>
              <span>Last 30 days</span>
              <strong>{monthMoney}</strong>
            </div>
          </div>
        </article>

        <article className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <h2>Recent orders</h2>
              <p>Latest saved orders across accounts.</p>
            </div>
            <Link className="dash-banner-link" href="/orders">View all orders</Link>
          </div>
          {recent.length === 0 ? (
            <p className="dash-empty-chart">No saved orders yet.</p>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-recent">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Account</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((order) => (
                    <tr key={order.id}>
                      <td><Link href={`/orders?q=${encodeURIComponent(order.posting)}`}>{order.posting}</Link></td>
                      <td>{order.account}</td>
                      <td><span className={`dash-status dash-status-${order.status}`}>{order.statusLabel}</span></td>
                      <td>{order.created}</td>
                      <td>{order.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </>
  );
}
