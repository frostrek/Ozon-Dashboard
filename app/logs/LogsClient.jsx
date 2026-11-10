'use client';

import { useState, useMemo } from 'react';
import ListPager from '../components/ListPager';
import { FETCH_SIZE, UI_BATCH, useBatchScroll } from '../hooks/useBatchScroll';

function formatLogDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseLogExcerpt(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const parsed = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let time = '';
    let msg = trimmed;

    // Extract ISO timestamp if present: [2026-11-05T11:57:17.748Z] or 2026-11-05T11:57:17.748Z
    const m = trimmed.match(/^\[?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]?\s*(.*)$/);
    if (m) {
      try {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) {
          time = d.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
        } else {
          time = m[1].slice(11, 19);
        }
      } catch {
        time = m[1].slice(11, 19);
      }
      msg = m[2];
    }

    // Check ORDER_PICTURE machine payload -> convert to readable breakdown
    if (msg.startsWith('ORDER_PICTURE')) {
      try {
        const jsonStr = msg.replace(/^ORDER_PICTURE\s*/, '');
        const data = JSON.parse(jsonStr);
        if (data && Array.isArray(data.rows)) {
          const activeRows = data.rows.filter((r) => r.count > 0);
          const breakdown = activeRows.length > 0
            ? activeRows.map((r) => `${r.label || r.status}: ${r.count}`).join(' · ')
            : 'No pending orders';
          parsed.push({
            time,
            type: 'snapshot',
            level: 'DATA',
            text: `Order Status Snapshot (${data.days || 30} days): ${breakdown}`,
            snapshotRows: activeRows,
          });
          continue;
        }
      } catch {
        // Fallback to raw text
      }
    }

    // Classify line types for syntax highlighting & level tags
    let type = 'info';
    let level = 'INFO';
    const lower = msg.toLowerCase();
    if (lower.includes('error') || lower.includes('failed') || lower.includes('exception') || lower.includes('❌')) {
      type = 'error';
      level = 'ERR ';
    } else if (lower.includes('done') || lower.includes('success') || lower.includes('completed') || lower.includes('✅')) {
      type = 'success';
      level = 'OK  ';
    } else if (lower.includes('warn') || lower.includes('cancelled')) {
      type = 'warning';
      level = 'WARN';
    } else if (
      lower.startsWith('fetching') ||
      lower.startsWith('counting') ||
      lower.startsWith('updating') ||
      lower.startsWith('saving') ||
      lower.startsWith('translating') ||
      lower.startsWith('generating') ||
      lower.startsWith('building')
    ) {
      type = 'step';
      level = 'STEP';
    }

    parsed.push({ time, type, level, text: msg });
  }

  return parsed;
}

export default function LogsClient({ initialRuns, total }) {
  const [copiedId, setCopiedId] = useState(null);
  const [viewModes, setViewModes] = useState({});
  const [collapsedRuns, setCollapsedRuns] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const scroll = useBatchScroll({
    initialItems: initialRuns,
    initialTotal: total,
    resetKey: 'logs',
    itemKey: 'id',
    pageMode: true,
    loadPage: async (page) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(FETCH_SIZE) });
      const response = await fetch(`/api/logs?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Logs could not be loaded.');
      return { items: data.runs || [], total: Number(data.total) || 0 };
    },
  });

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (scroll.refresh) {
        await scroll.refresh();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const toggleViewMode = (runId, mode) => {
    setViewModes((prev) => ({ ...prev, [runId]: mode }));
  };

  const toggleCollapse = (runId) => {
    setCollapsedRuns((prev) => ({ ...prev, [runId]: !prev[runId] }));
  };

  const copyLog = (run) => {
    if (!run?.logExcerpt) return;
    navigator.clipboard?.writeText(run.logExcerpt);
    setCopiedId(run.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadLog = (run) => {
    if (!run?.logExcerpt) return;
    const blob = new Blob([run.logExcerpt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedAccount = (run.accountName || 'run').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    link.download = `pipeline-${sanitizedAccount}-${run.id ? run.id.slice(-6) : 'log'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Compute stats across current items
  const stats = useMemo(() => {
    let success = 0;
    let failed = 0;
    let cancelled = 0;
    for (const r of scroll.items) {
      if (r.cancelled) cancelled++;
      else if (r.status === 'success') success++;
      else if (r.status === 'failed') failed++;
    }
    return { total: scroll.items.length, success, failed, cancelled };
  }, [scroll.items]);

  // Filter items based on user selection
  const filteredRuns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scroll.items.filter((run) => {
      // Status filter
      if (statusFilter === 'success' && (run.status !== 'success' || run.cancelled)) return false;
      if (statusFilter === 'failed' && run.status !== 'failed') return false;
      if (statusFilter === 'cancelled' && !run.cancelled) return false;

      // Query filter
      if (q) {
        const matchesAccount = (run.accountName || '').toLowerCase().includes(q);
        const matchesId = (run.id || '').toLowerCase().includes(q);
        const matchesLog = (run.logExcerpt || '').toLowerCase().includes(q);
        if (!matchesAccount && !matchesId && !matchesLog) return false;
      }
      return true;
    });
  }, [scroll.items, statusFilter, searchQuery]);

  // Toggle expand / collapse all
  const areAllCollapsed = useMemo(() => {
    if (filteredRuns.length === 0) return false;
    return filteredRuns.every((r) => collapsedRuns[r.id]);
  }, [filteredRuns, collapsedRuns]);

  const toggleAllCollapse = () => {
    const nextState = !areAllCollapsed;
    const updated = {};
    for (const r of filteredRuns) {
      updated[r.id] = nextState;
    }
    setCollapsedRuns((prev) => ({ ...prev, ...updated }));
  };

  return (
    <div className="logs-page-wrap">
      {/* Top Header & Actions Row (Clean single horizontal layout) */}
      <div
        className="logs-header-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: 0, whiteSpace: 'nowrap' }}>
            Logs
          </h1>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#5A7572',
              background: '#F1F5F9',
              padding: '3px 9px',
              borderRadius: 6,
            }}
          >
            {scroll.total} execution runs
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div className="logs-search-box">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search logs, errors, or accounts…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search logs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '0 2px', fontSize: 16 }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="reports-tabs" style={{ background: '#FFFFFF', border: '1px solid #CCECE8', borderRadius: 10, padding: 3 }}>
            {[
              { id: 'all', label: 'All Runs', count: stats.total },
              { id: 'success', label: '✓ Success', count: stats.success },
              { id: 'failed', label: '✕ Failed', count: stats.failed },
            ].map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`reports-tab-btn${active ? ' is-active' : ''}`}
                  onClick={() => setStatusFilter(tab.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px' }}
                >
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      opacity: active ? 0.9 : 0.7,
                      padding: '1px 5px',
                      borderRadius: 999,
                      background: active ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                      color: active ? '#FFFFFF' : '#475569',
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Expand / Collapse All Toggle */}
          {filteredRuns.length > 0 && (
            <button
              type="button"
              className="dash-outline"
              onClick={toggleAllCollapse}
              style={{ height: 36, padding: '0 12px', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              title={areAllCollapsed ? 'Expand all console outputs' : 'Collapse all console outputs'}
            >
              <span>{areAllCollapsed ? '▾ Expand All' : '▴ Collapse All'}</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            className={`dash-outline orders-refresh${refreshing ? ' is-busy' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ height: 36 }}
            title="Refresh logs"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12a8 8 0 1 1-2.2-5.5" />
              <path d="M20 4v5h-5" />
            </svg>
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Loading & Error States */}
      {scroll.loading && scroll.items.length === 0 ? (
        <div className="orders-loading-banner" style={{ marginBottom: 20 }}>
          <div className="orders-loading-spinner" />
          <div>
            <strong>Loading execution logs…</strong>
            <span>Reading historical run traces</span>
          </div>
        </div>
      ) : null}

      {scroll.error ? (
        <p className="notice notice-error" role="alert" style={{ marginBottom: 16 }}>
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>
            Retry
          </button>
        </p>
      ) : null}

      {/* Empty State */}
      {filteredRuns.length === 0 && !scroll.loading ? (
        <div
          style={{
            background: '#FFFFFF',
            border: '1px dashed #CCECE8',
            borderRadius: 14,
            padding: '50px 20px',
            textAlign: 'center',
            color: '#64748B',
            marginBottom: 20,
          }}
        >
          <strong style={{ display: 'block', fontSize: 16, color: '#0F172A', marginBottom: 6 }}>
            No logs match the current filters.
          </strong>
          <p style={{ margin: '0 0 14px', fontSize: 13.5 }}>
            {searchQuery ? `No results found for "${searchQuery}".` : 'Start a pipeline run to generate logs.'}
          </p>
          {(statusFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              className="dash-outline"
              onClick={() => {
                setStatusFilter('all');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : null}

      {/* Log Run Cards Stack */}
      <div className="logs-cards-stack" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
        {filteredRuns.map((run) => {
          const isRaw = viewModes[run.id] === 'raw';
          const isCollapsed = Boolean(collapsedRuns[run.id]);
          const parsedLines = parseLogExcerpt(run.logExcerpt);
          const isSuccess = run.status === 'success' && !run.cancelled;
          const isFailed = run.status === 'failed';
          const isCancelled = Boolean(run.cancelled);

          return (
            <div
              key={run.id}
              className="log-card-modern"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                overflow: 'hidden',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              {/* Card Header Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#FFFFFF',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                {/* Meta Left: Status, Account, Run ID, Time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {/* Status Badge */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      background: isSuccess ? '#ECFDF5' : isFailed ? '#FEF2F2' : isCancelled ? '#F8FAFC' : '#EFF6FF',
                      color: isSuccess ? '#059669' : isFailed ? '#DC2626' : isCancelled ? '#64748B' : '#2563EB',
                      border: `1px solid ${isSuccess ? '#A7F3D0' : isFailed ? '#FECACA' : isCancelled ? '#E2E8F0' : '#BFDBFE'}`,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: isSuccess ? '#10B981' : isFailed ? '#EF4444' : isCancelled ? '#94A3B8' : '#3B82F6',
                      }}
                    />
                    <span>{isCancelled ? 'Cancelled' : isSuccess ? 'Succeeded' : isFailed ? 'Failed' : run.status || 'Saved'}</span>
                  </span>

                  {/* Account Name */}
                  <span style={{ fontSize: 14.5, fontWeight: 750, color: '#0F172A', whiteSpace: 'nowrap' }}>
                    {run.accountName}
                  </span>

                  {/* Run ID Pill */}
                  {run.id && (
                    <span
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: '#475569',
                        background: '#F1F5F9',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid #E2E8F0',
                      }}
                      title={`Run ID: ${run.id}`}
                    >
                      #{run.id.slice(-6)}
                    </span>
                  )}

                  {/* Timestamp */}
                  <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500, whiteSpace: 'nowrap' }} suppressHydrationWarning>
                    {formatLogDate(run.startTime)}
                  </span>
                </div>

                {/* Actions Right: Line count, Toggle readable/raw, Copy, Download, Expand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600, marginRight: 4 }}>
                    {parsedLines.length} lines
                  </span>

                  {/* Readable / Raw Segmented Control */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: '#F1F5F9',
                      borderRadius: 8,
                      padding: 2,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleViewMode(run.id, 'human')}
                      style={{
                        border: 'none',
                        background: !isRaw ? '#FFFFFF' : 'transparent',
                        color: !isRaw ? '#0F172A' : '#64748B',
                        fontWeight: !isRaw ? 700 : 550,
                        fontSize: 11.5,
                        padding: '3px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        boxShadow: !isRaw ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Formatted
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleViewMode(run.id, 'raw')}
                      style={{
                        border: 'none',
                        background: isRaw ? '#FFFFFF' : 'transparent',
                        color: isRaw ? '#0F172A' : '#64748B',
                        fontWeight: isRaw ? 700 : 550,
                        fontSize: 11.5,
                        padding: '3px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        boxShadow: isRaw ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Raw
                    </button>
                  </div>

                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={() => copyLog(run)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 28,
                      padding: '0 8px',
                      fontSize: 11.5,
                      fontWeight: 650,
                      borderRadius: 6,
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      color: copiedId === run.id ? '#059669' : '#334155',
                      cursor: 'pointer',
                    }}
                    title="Copy full log"
                  >
                    {copiedId === run.id ? (
                      <>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#059669" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  {/* Download Button */}
                  <button
                    type="button"
                    onClick={() => downloadLog(run)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 28,
                      padding: '0 8px',
                      fontSize: 11.5,
                      fontWeight: 650,
                      borderRadius: 6,
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      color: '#334155',
                      cursor: 'pointer',
                    }}
                    title="Download log file (.txt)"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>.txt</span>
                  </button>

                  {/* Expand / Collapse Chevron */}
                  <button
                    type="button"
                    className="log-collapse-btn"
                    onClick={() => toggleCollapse(run.id)}
                    style={{
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                    }}
                    title={isCollapsed ? 'Expand console' : 'Collapse console'}
                    aria-label={isCollapsed ? 'Expand console' : 'Collapse console'}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Developer Console Output (Clean Light Monospace Theme) */}
              {!isCollapsed && (
                <div
                  style={{
                    background: '#F8FAFC',
                    borderTop: '1px solid #E2E8F0',
                  }}
                >
                  {/* Console Header Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 14px',
                      background: '#F1F5F9',
                      borderBottom: '1px solid #E2E8F0',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: 11.5,
                      color: '#475569',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#10756F', fontWeight: 800 }}>$</span>
                      <span style={{ color: '#0F172A', fontWeight: 700 }}>ozon-pipeline</span>
                      <span style={{ color: '#94A3B8' }}>&gt;</span>
                      <span style={{ color: '#475569', fontWeight: 600 }}>stdout.log</span>
                    </div>
                    <span style={{ color: '#64748B', fontSize: 11 }}>
                      {isRaw ? 'raw text' : `${parsedLines.length} lines captured`}
                    </span>
                  </div>

                  {/* Terminal Lines Container */}
                  <div
                    style={{
                      padding: '12px 14px',
                      maxHeight: 340,
                      overflowY: 'auto',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: '#1E293B',
                      background: '#F8FAFC',
                    }}
                  >
                    {isRaw ? (
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'inherit', fontSize: 'inherit', color: '#1E293B' }}>
                        {run.logExcerpt || 'No log was saved for this run.'}
                      </pre>
                    ) : parsedLines.length === 0 ? (
                      <p style={{ margin: 0, color: '#64748B', fontStyle: 'italic' }}>
                        No log was saved for this run.
                      </p>
                    ) : (
                      parsedLines.map((entry, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background:
                              entry.type === 'error'
                                ? 'rgba(239, 68, 68, 0.08)'
                                : entry.type === 'success'
                                ? 'rgba(16, 185, 129, 0.06)'
                                : entry.type === 'warning'
                                ? 'rgba(245, 158, 11, 0.06)'
                                : 'transparent',
                          }}
                        >
                          {/* Gutter Line Number */}
                          <span
                            style={{
                              flexShrink: 0,
                              minWidth: 22,
                              color: '#94A3B8',
                              fontSize: 11,
                              userSelect: 'none',
                              textAlign: 'right',
                              fontWeight: 500,
                            }}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>

                          {/* Time */}
                          {entry.time ? (
                            <span
                              style={{
                                flexShrink: 0,
                                color: '#64748B',
                                fontSize: 11,
                                letterSpacing: '0.01em',
                              }}
                              suppressHydrationWarning
                            >
                              {entry.time}
                            </span>
                          ) : null}

                          {/* Level Badge (Light Theme) */}
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: 10,
                              fontWeight: 750,
                              padding: '1px 5px',
                              borderRadius: 4,
                              letterSpacing: '0.03em',
                              textAlign: 'center',
                              minWidth: 38,
                              userSelect: 'none',
                              background:
                                entry.type === 'error'
                                  ? '#FEE2E2'
                                  : entry.type === 'success'
                                  ? '#ECFDF5'
                                  : entry.type === 'warning'
                                  ? '#FEF3C7'
                                  : entry.type === 'step'
                                  ? '#E0F2FE'
                                  : '#F1F5F9',
                              color:
                                entry.type === 'error'
                                  ? '#B91C1C'
                                  : entry.type === 'success'
                                  ? '#047857'
                                  : entry.type === 'warning'
                                  ? '#B45309'
                                  : entry.type === 'step'
                                  ? '#0369A1'
                                  : '#475569',
                              border:
                                entry.type === 'error'
                                  ? '1px solid #FECACA'
                                  : entry.type === 'success'
                                  ? '1px solid #A7F3D0'
                                  : entry.type === 'warning'
                                  ? '1px solid #FDE68A'
                                  : entry.type === 'step'
                                  ? '1px solid #BAE6FD'
                                  : '1px solid #E2E8F0',
                            }}
                          >
                            {entry.level || 'INFO'}
                          </span>

                          {/* Message Content */}
                          <span
                            style={{
                              flex: 1,
                              wordBreak: 'break-word',
                              color:
                                entry.type === 'error'
                                  ? '#B91C1C'
                                  : entry.type === 'success'
                                  ? '#047857'
                                  : entry.type === 'warning'
                                  ? '#92400E'
                                  : entry.type === 'step'
                                  ? '#0369A1'
                                  : '#1E293B',
                              fontWeight: entry.type === 'error' || entry.type === 'success' ? 650 : 450,
                            }}
                          >
                            {entry.text}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {scroll.total > 0 ? (
        <ListPager
          label="Log pages"
          page={scroll.currentPage}
          pageCount={scroll.pageCount}
          start={scroll.rangeStart}
          end={scroll.rangeEnd}
          total={scroll.total}
          pageSize={UI_BATCH}
          noun="runs"
          onPage={scroll.goToPage}
        />
      ) : null}
    </div>
  );
}
