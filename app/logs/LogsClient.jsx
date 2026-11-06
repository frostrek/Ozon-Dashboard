'use client';

import { useState } from 'react';
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
            text: `📊 Order Status Snapshot (${data.days || 30} days): ${breakdown}`,
          });
          continue;
        }
      } catch {
        // Fallback to raw text
      }
    }

    // Classify line types for syntax highlighting
    let type = 'info';
    const lower = msg.toLowerCase();
    if (lower.includes('error') || lower.includes('failed') || lower.includes('exception') || lower.includes('❌')) {
      type = 'error';
    } else if (lower.includes('done') || lower.includes('success') || lower.includes('completed') || lower.includes('✅')) {
      type = 'success';
    } else if (lower.includes('warn') || lower.includes('cancelled')) {
      type = 'warning';
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
    }

    parsed.push({ time, type, text: msg });
  }

  return parsed;
}

export default function LogsClient({ initialRuns, total }) {
  const [copiedId, setCopiedId] = useState(null);
  const [viewModes, setViewModes] = useState({});

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

  const toggleViewMode = (runId, mode) => {
    setViewModes((prev) => ({ ...prev, [runId]: mode }));
  };

  const copyLog = (run) => {
    if (!run?.logExcerpt) return;
    navigator.clipboard?.writeText(run.logExcerpt);
    setCopiedId(run.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (scroll.total === 0 && scroll.items.length === 0 && !scroll.loading) {
    return (
      <section className="catalog-empty">
        <h2>No logs yet</h2>
        <p>Start a pipeline run and its log will show up here.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      {scroll.loading ? <p className="page-lead">Loading logs…</p> : null}
      {scroll.error ? (
        <p className="notice notice-error" role="alert">
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>Retry</button>
        </p>
      ) : null}

      {scroll.items.map((run) => {
        const isRaw = viewModes[run.id] === 'raw';
        const parsedLines = parseLogExcerpt(run.logExcerpt);
        const statusClass = run.cancelled
          ? 'log-status-cancelled'
          : run.status === 'success'
          ? 'log-status-success'
          : run.status === 'failed'
          ? 'log-status-failed'
          : 'log-status-running';

        return (
          <section key={run.id} className="log-card">
            <div className="log-card-header">
              <div className="log-card-meta">
                <h2 className="log-account-name">{run.accountName}</h2>
                <span className="log-time" suppressHydrationWarning>
                  {formatLogDate(run.startTime)}
                </span>
              </div>

              <div className="log-card-actions">
                <span className={`log-status-badge ${statusClass}`}>
                  {run.cancelled
                    ? 'Cancelled'
                    : run.status === 'success'
                    ? 'Success'
                    : run.status === 'failed'
                    ? 'Failed'
                    : run.status || 'Saved'}
                </span>

                <div className="log-btn-group">
                  <button
                    type="button"
                    className={`log-toggle-btn${!isRaw ? ' is-active' : ''}`}
                    onClick={() => toggleViewMode(run.id, 'human')}
                  >
                    Readable
                  </button>
                  <button
                    type="button"
                    className={`log-toggle-btn${isRaw ? ' is-active' : ''}`}
                    onClick={() => toggleViewMode(run.id, 'raw')}
                  >
                    Raw
                  </button>
                </div>

                <button
                  type="button"
                  className="log-action-btn"
                  onClick={() => copyLog(run)}
                  title="Copy log to clipboard"
                >
                  {copiedId === run.id ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="log-console">
              {isRaw ? (
                <pre className="log-raw">{run.logExcerpt || 'No log was saved for this run.'}</pre>
              ) : parsedLines.length === 0 ? (
                <p className="log-empty-note">No log was saved for this run.</p>
              ) : (
                parsedLines.map((entry, idx) => (
                  <div key={idx} className={`log-entry log-entry-${entry.type}`}>
                    {entry.time ? (
                      <span className="log-entry-time" suppressHydrationWarning>
                        {entry.time}
                      </span>
                    ) : null}
                    <span className="log-entry-content">{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}

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
