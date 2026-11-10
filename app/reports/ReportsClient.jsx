'use client';

import { useState, useMemo } from 'react';
import ListPager from '../components/ListPager';
import { FETCH_SIZE, UI_BATCH, useBatchScroll } from '../hooks/useBatchScroll';

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReportsClient({ initialReports = [], total = 0, accounts = [] }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const scroll = useBatchScroll({
    initialItems: initialReports,
    initialTotal: total,
    resetKey: accountFilter,
    itemKey: 'id',
    pageMode: true,
    loadPage: async (page) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(FETCH_SIZE),
        account: accountFilter,
        status: 'all',
      });
      const response = await fetch(`/api/reports?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Reports could not be loaded.');
      return { items: data.reports || [], total: Number(data.total) || 0 };
    },
  });

  // 0ms instant client-side tab switching without network roundtrips or spinner flickers
  const displayedItems = useMemo(() => {
    if (statusFilter === 'all') return scroll.items;
    if (statusFilter === 'success') return scroll.items.filter((r) => r.status === 'success');
    if (statusFilter === 'failed') return scroll.items.filter((r) => r.status !== 'success');
    return scroll.items;
  }, [scroll.items, statusFilter]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await scroll.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="reports-page-wrap">
      {/* Top Header & Controls Row (Clean, single horizontal line) */}
      <div
        className="reports-top-bar"
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
          Reports & Exports
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#FFFFFF',
            border: '1px solid #CCECE8',
            borderRadius: 12,
            padding: '6px 10px',
            boxShadow: '0 1px 3px rgba(12, 93, 88, 0.05)',
          }}
        >
          <div className="reports-tabs">
            {[
              { id: 'all', label: 'All Reports' },
              { id: 'success', label: '✓ Successful' },
              { id: 'failed', label: '✕ Failed' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`reports-tab-btn${statusFilter === tab.id ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {accounts.length > 0 && (
            <select
              className="reports-select"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              aria-label="Filter by Account"
            >
              <option value="all">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className={`dash-outline orders-refresh${refreshing ? ' is-busy' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh reports"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12a8 8 0 1 1-2.2-5.5" />
              <path d="M20 4v5h-5" />
            </svg>
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Errors & Notifications */}
      {scroll.error && (
        <p className="notice notice-error" role="alert" style={{ marginBottom: 16 }}>
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>
            Retry
          </button>
        </p>
      )}

      {/* Table (Well-spaced across full width) */}
      <div className="table-wrap orders-table-wrap" ref={scroll.tableWrapRef}>
        <table className="reports-table">
          <thead>
            <tr>
              <th style={{ width: '25%' }}>Report / Date</th>
              <th style={{ width: '20%' }}>Account</th>
              <th style={{ width: '18%' }}>Orders</th>
              <th style={{ width: '17%' }}>Status</th>
              <th style={{ width: '20%' }}>Generated Assets / Files</th>
            </tr>
          </thead>
          <tbody>
            {scroll.loading && displayedItems.length === 0 ? (
              <>
                <tr>
                  <td colSpan="5" style={{ padding: 0 }}>
                    <div className="orders-loading-banner">
                      <div className="orders-loading-spinner" />
                      <div>
                        <strong>Loading reports…</strong>
                        <span>Fetching historical pipeline runs</span>
                      </div>
                    </div>
                  </td>
                </tr>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={`report-skel-${i}`} className="orders-skeleton-row">
                    <td>
                      <div className="orders-skeleton-box" style={{ width: 170, height: 16, borderRadius: 4 }} />
                    </td>
                    <td><div className="orders-skeleton-box" style={{ width: 100, height: 24, borderRadius: 999 }} /></td>
                    <td><div className="orders-skeleton-box" style={{ width: 85, height: 20, borderRadius: 4 }} /></td>
                    <td><div className="orders-skeleton-box" style={{ width: 90, height: 24, borderRadius: 999 }} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div className="orders-skeleton-box" style={{ width: 120, height: 30, borderRadius: 6 }} />
                        <div className="orders-skeleton-box" style={{ width: 95, height: 30, borderRadius: 6 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            ) : displayedItems.length === 0 ? (
              <tr>
                <td colSpan="5" className="orders-empty" style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <strong>No reports match these criteria.</strong>
                  <p>Run a pipeline to generate shipment reports, or clear your filters.</p>
                  {(statusFilter !== 'all' || accountFilter !== 'all') && (
                    <button
                      type="button"
                      className="dash-outline"
                      onClick={() => {
                        setStatusFilter('all');
                        setAccountFilter('all');
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              displayedItems.map((report) => {
                const isSuccess = report.status === 'success';
                return (
                  <tr key={report.id}>
                    {/* Date & Time (Clean, no subtag) */}
                    <td>
                      <span style={{ fontSize: 13.5, fontWeight: 650, color: '#1E293B', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtDate(report.createdAt)}
                      </span>
                    </td>

                    {/* Account */}
                    <td>
                      <span className="orders-account-pill" style={{ padding: '4px 10px', fontSize: 12 }}>
                        {report.accountName}
                      </span>
                    </td>

                    {/* Orders Processed */}
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#0C5D58', fontSize: 13.5 }}>
                        <span>📦</span>
                        <span>{report.ordersProcessed || 0}</span>
                        <span style={{ fontSize: 12, color: '#5A7572', fontWeight: 500 }}>orders</span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td>
                      <span
                        className="orders-badge"
                        style={{
                          padding: '4px 12px',
                          fontSize: 12,
                          background: isSuccess ? '#ECFDF5' : '#FEF2F2',
                          color: isSuccess ? '#059669' : '#DC2626',
                          border: `1px solid ${isSuccess ? '#A7F3D0' : '#FECACA'}`,
                        }}
                      >
                        {isSuccess ? '✓ Completed' : report.status || 'Saved'}
                      </span>
                    </td>

                    {/* Downloadable Assets (strictly horizontal in a row) */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                        {report.pdfUrl ? (
                          <a
                            className="reports-asset-btn is-pdf"
                            href={`/api/download?file=${report.pdfUrl.replace(/^\//, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open / Print Product List PDF"
                            style={{ padding: '6px 12px', fontSize: 12.5 }}
                          >
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                            <span>Product List (PDF)</span>
                          </a>
                        ) : null}

                        {report.excelUrl ? (
                          <a
                            className="reports-asset-btn is-excel"
                            href={`/api/download?file=${report.excelUrl.replace(/^\//, '')}&v=2`}
                            title="Download Excel Shipment Report"
                            style={{ padding: '6px 12px', fontSize: 12.5 }}
                          >
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <path d="M8 13h2" />
                              <path d="M8 17h2" />
                              <path d="M14 13h2" />
                              <path d="M14 17h2" />
                            </svg>
                            <span>Excel Sheet</span>
                          </a>
                        ) : null}

                        {report.filesMissing && (
                          <span className="reports-missing-tag" title="Temporary server files cleared after deploy. Database history preserved.">
                            ⚠️ Files cleared after deploy
                          </span>
                        )}

                        {!report.pdfUrl && !report.excelUrl && !report.filesMissing && (
                          <span style={{ color: '#94A3B8', fontSize: 13 }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {scroll.total > 0 && (
        <ListPager
          label="Report pages"
          page={scroll.currentPage}
          pageCount={statusFilter === 'all' ? scroll.pageCount : Math.max(1, Math.ceil(displayedItems.length / UI_BATCH))}
          start={scroll.rangeStart}
          end={statusFilter === 'all' ? scroll.rangeEnd : Math.min(displayedItems.length, UI_BATCH)}
          total={statusFilter === 'all' ? scroll.total : displayedItems.length}
          pageSize={UI_BATCH}
          noun="reports"
          onPage={scroll.goToPage}
        />
      )}
    </div>
  );
}
