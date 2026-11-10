'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AccountForm from './AccountForm';
import DeleteAccount from './DeleteAccount';

export default function AccountsClient({ rows, stats, action, saved }) {
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(saved || false);
  const [copiedId, setCopiedId] = useState(null);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!needle) return rows;
    return rows.filter((account) => (
      account.name.toLowerCase().includes(needle)
      || account.clientId.toLowerCase().includes(needle)
    ));
  }, [needle, rows]);

  const copyClientId = (id, clientId) => {
    navigator.clipboard?.writeText(clientId);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="accounts-page-wrap">
      {/* Top Header Row (Clean single horizontal line) */}
      <div
        className="accounts-top-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: 0, whiteSpace: 'nowrap' }}>
          Accounts
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Add Account Toggle Button */}
          <button
            type="button"
            className="dash-primary"
            onClick={() => setFormOpen((v) => !v)}
            style={{
              height: 36,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 8,
              cursor: 'pointer',
              background: formOpen ? '#475569' : '#10756F',
              borderColor: formOpen ? '#475569' : '#10756F',
            }}
          >
            {formOpen ? (
              <>
                <span>✕</span>
                <span>Close</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Account</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Metrics Bar (Modern Cards) */}
      <div
        className="accounts-metrics-row"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #CCECE8',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 1px 3px rgba(12, 93, 88, 0.04)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#E8F5F4',
              color: '#10756F',
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            🏪
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A7572', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Connected Stores
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              {stats?.totalAccounts || rows.length}{' '}
              <span style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>
                ({stats?.activeAccounts || rows.length} Active)
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #CCECE8',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 1px 3px rgba(12, 93, 88, 0.04)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#ECFDF5',
              color: '#059669',
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            📦
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A7572', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Orders Today
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              {stats?.totalOrdersToday || 0}{' '}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>processed</span>
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #CCECE8',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 1px 3px rgba(12, 93, 88, 0.04)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: stats?.anyRunning ? '#EFF6FF' : '#F0FDF4',
              color: stats?.anyRunning ? '#2563EB' : '#16A34A',
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {stats?.anyRunning ? '⚡' : '✓'}
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5A7572', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pipeline Status
            </div>
            <div style={{ fontSize: 15, fontWeight: 750, color: stats?.anyRunning ? '#2563EB' : '#16A34A', lineHeight: 1.2 }}>
              {stats?.anyRunning ? 'Pipeline Running…' : 'All Systems Ready'}
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Add Account Form Card */}
      {formOpen && (
        <div
          className="accounts-form-card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #10756F',
            borderRadius: 14,
            padding: '18px 20px',
            marginBottom: 22,
            boxShadow: '0 4px 18px rgba(16, 117, 111, 0.08)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: '0 0 2px' }}>
                Connect Ozon Seller Account
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#5A7572' }}>
                Enter your Ozon seller credentials to authorize API order fulfillment and synchronization.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: 18,
                padding: '4px 8px',
                borderRadius: 6,
              }}
              aria-label="Close form"
            >
              ✕
            </button>
          </div>

          <AccountForm action={action} saved={saved} onDone={() => setFormOpen(false)} />
        </div>
      )}

      {/* Connected Accounts Table Card */}
      <section
        style={{
          background: '#FFFFFF',
          border: '1px solid #CCECE8',
          borderRadius: 14,
          boxShadow: '0 1px 3px rgba(12, 93, 88, 0.04)',
          overflow: 'hidden',
        }}
      >
        {rows.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏪</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>
              No seller accounts connected
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13.5 }}>
              Add your first Ozon seller account to start syncing orders and processing labels.
            </p>
            <button
              type="button"
              className="dash-primary"
              onClick={() => setFormOpen(true)}
              style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8 }}
            >
              + Add Seller Account
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748B' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>
              No accounts match “{query.trim()}”
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13.5 }}>Try searching by another store name or client ID.</p>
            <button
              type="button"
              className="dash-outline"
              onClick={() => setQuery('')}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="table-wrap" style={{ margin: 0 }}>
            <table className="accounts-table">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}>#</th>
                  <th style={{ width: '28%' }}>Store / Account</th>
                  <th style={{ width: '18%' }}>Client ID</th>
                  <th style={{ width: '14%' }}>API Status</th>
                  <th style={{ width: '16%' }}>Last Sync</th>
                  <th style={{ width: '10%' }}>Orders Today</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((account, index) => (
                  <tr key={account.id}>
                    <td className="accounts-index" style={{ color: '#94A3B8', fontWeight: 600 }}>
                      {index + 1}
                    </td>

                    {/* Store Identity */}
                    <td>
                      <div className="accounts-identity">
                        <span className="accounts-mark" aria-hidden="true">
                          Oz
                        </span>
                        <div>
                          <strong style={{ fontSize: 14, color: '#0F172A' }}>{account.name}</strong>
                        </div>
                      </div>
                    </td>

                    {/* Client ID with Copy button */}
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontSize: 12,
                            fontWeight: 650,
                            color: '#334155',
                            background: '#F1F5F9',
                            padding: '3px 8px',
                            borderRadius: 6,
                            border: '1px solid #E2E8F0',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {account.clientId}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyClientId(account.id, account.clientId)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            background: copiedId === account.id ? '#ECFDF5' : 'transparent',
                            border: `1px solid ${copiedId === account.id ? '#A7F3D0' : '#E2E8F0'}`,
                            cursor: 'pointer',
                            color: copiedId === account.id ? '#059669' : '#64748B',
                            padding: 0,
                            transition: 'all 0.15s ease',
                          }}
                          title={copiedId === account.id ? 'Copied to clipboard!' : 'Copy Client ID'}
                          aria-label="Copy Client ID"
                        >
                          {copiedId === account.id ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Connection Status */}
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          fontSize: 12,
                          fontWeight: 650,
                          lineHeight: 1,
                          borderRadius: 999,
                          background: account.active ? '#ECFDF5' : '#FEF2F2',
                          color: account.active ? '#059669' : '#DC2626',
                          border: `1px solid ${account.active ? '#A7F3D0' : '#FECACA'}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: account.active ? '#10B981' : '#EF4444',
                            flexShrink: 0,
                            display: 'inline-block',
                          }}
                        />
                        <span>{account.active ? 'Connected' : 'Inactive'}</span>
                      </span>
                    </td>

                    {/* Last Sync */}
                    <td>
                      <span style={{ fontSize: 13, color: '#334155', whiteSpace: 'nowrap' }}>
                        {account.lastSync}
                      </span>
                    </td>

                    {/* Orders Today */}
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 12.5,
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: 6,
                          background: account.ordersToday > 0 ? '#E8F5F4' : '#F1F5F9',
                          color: account.ordersToday > 0 ? '#0C5D58' : '#64748B',
                        }}
                      >
                        <span>📦</span>
                        <span>{account.ordersToday}</span>
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="accounts-actions" style={{ justifyContent: 'flex-end' }}>
                        <Link
                          className={`accounts-run${account.running ? ' is-busy' : ''}`}
                          href={`/pipeline?accountId=${account.id}`}
                          aria-disabled={account.running ? 'true' : undefined}
                          title={account.running ? 'Pipeline is currently executing' : 'Trigger pipeline run for this account'}
                          style={{
                            height: 32,
                            padding: '0 12px',
                            fontSize: 12.5,
                            fontWeight: 700,
                            borderRadius: 7,
                            background: '#10756F',
                            color: '#FFFFFF',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          <span>{account.running ? 'Running…' : 'Run'}</span>
                        </Link>
                        <DeleteAccount id={account.id} name={account.name} />
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

