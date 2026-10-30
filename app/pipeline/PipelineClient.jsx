'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ListPager from '../components/ListPager';
import TypeSelect from '../components/TypeSelect';

function statusLabel(status, cancelled) {
  if (cancelled) return 'Cancelled';
  if (status === 'success') return 'Success';
  if (status === 'running') return 'Running';
  if (status === 'failed') return 'Failed';
  return status || '—';
}

function badgeClass(status, cancelled) {
  if (cancelled) return 'pipe-badge pipe-badge-muted';
  if (status === 'success') return 'pipe-badge pipe-badge-ok';
  if (status === 'running') return 'pipe-badge pipe-badge-run';
  if (status === 'failed') return 'pipe-badge pipe-badge-bad';
  return 'pipe-badge pipe-badge-muted';
}

function formatWhen(value) {
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

function clock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', { hour12: false });
}

function parseLogLine(line) {
  const bracket = line.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracket) {
    const text = bracket[2] || line;
    return { time: clock(bracket[1]), level: levelFromText(text), text };
  }
  if (line.startsWith('{')) {
    try {
      const entry = JSON.parse(line);
      const text = typeof entry.msg === 'string' ? entry.msg : line;
      let level = 'info';
      if (typeof entry.level === 'number') {
        if (entry.level >= 50) level = 'error';
        else if (entry.level >= 40) level = 'warn';
        else if (entry.level >= 30) level = 'info';
        else level = 'debug';
      }
      return { time: entry.time ? clock(entry.time) : '', level: levelFromText(text) === 'error' ? 'error' : level, text };
    } catch {
      return { time: '', level: 'plain', text: line };
    }
  }
  return { time: '', level: levelFromText(line), text: line };
}

function levelFromText(text) {
  const lower = text.toLowerCase();
  if (lower.includes('fail') || lower.includes('error')) return 'error';
  if (lower.includes('limit') || lower.includes('warn') || lower.includes('paus')) return 'warn';
  return 'info';
}

function ErrorDetails({ run, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div
        className="confirm-card pipe-error-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-error-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="run-error-title">Run error</h2>
        <p>{run.account_name || '—'} · {formatWhen(run.start_time)}</p>
        <pre className="pipe-error-full">{run.error_message}</pre>
        <div className="confirm-actions">
          <button ref={closeRef} type="button" className="dash-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function PipelineClient({ accounts, initialAccountId }) {
  const [accountId, setAccountId] = useState(initialAccountId || '');
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [historyState, setHistoryState] = useState('loading');
  const [historyError, setHistoryError] = useState('');
  const [activeRunId, setActiveRunId] = useState('');
  const [logs, setLogs] = useState('');
  const [copied, setCopied] = useState(false);
  const [orderPicture, setOrderPicture] = useState(null);
  const [runs, setRuns] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(8);
  const [lastRun, setLastRun] = useState(null);
  const [lastSuccess, setLastSuccess] = useState(null);
  const [runningRun, setRunningRun] = useState(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [errorRun, setErrorRun] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const logRef = useRef(null);
  const sourceRef = useRef(null);
  const pageRef = useRef(1);
  const accountRef = useRef(accountId);
  pageRef.current = page;
  accountRef.current = accountId;

  async function loadRuns(nextPage = pageRef.current, nextAccount = accountRef.current) {
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: '8',
    });
    if (nextAccount) params.set('accountId', nextAccount);
    const res = await fetch(`/api/pipeline/runs?${params}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not load run history.');
    setRuns(data.runs || []);
    setTotal(Number(data.total) || 0);
    setPageSize(Number(data.pageSize) || 8);
    setPage(Number(data.page) || nextPage);
    setLastRun(data.lastRun || null);
    setLastSuccess(data.lastSuccess || null);
    setRunningRun(data.running || null);
    setHistoryState('ready');
    setHistoryError('');
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    loadRuns(page, accountId).catch((err) => {
      if (cancelled) return;
      setHistoryState('error');
      setHistoryError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [page, accountId]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (!activeRunId) return undefined;
    const timer = setInterval(() => {
      loadRuns(pageRef.current, accountRef.current).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [activeRunId]);

  useEffect(() => () => {
    if (sourceRef.current) sourceRef.current.close();
  }, []);

  function watchRun(runId) {
    if (sourceRef.current) sourceRef.current.close();
    setActiveRunId(runId);
    setLogs('');
    setOrderPicture(null);
    setOutcome(null);
    const source = new EventSource(`/api/pipeline/stream?runId=${encodeURIComponent(runId)}`);
    sourceRef.current = source;

    source.addEventListener('hello', () => setLogs(''));
    source.addEventListener('log', (event) => {
      const payload = JSON.parse(event.data);
      const line = payload.line || '';
      const marker = 'ORDER_PICTURE ';
      const markerAt = line.indexOf(marker);
      if (markerAt !== -1) {
        try {
          setOrderPicture(JSON.parse(line.slice(markerAt + marker.length)));
        } catch {
          setLogs((current) => `${current}${line}\n`);
        }
        return;
      }
      setLogs((current) => `${current}${line}\n`);
    });
    source.addEventListener('done', () => {
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
      setActiveRunId('');
      loadRuns().then((data) => {
        const finished = data?.lastRun?.id === runId ? data.lastRun : null;
        if (finished) setOutcome(finished);
      }).catch(() => {});
    });
    source.addEventListener('error', (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        setError(payload.message || 'Log stream failed');
      } catch {
        setError('Log stream failed');
      }
    });
  }

  const runningForAccount = runningRun && runningRun.account_id === accountId ? runningRun : null;
  const stopRunId = runningForAccount?.id || '';

  useEffect(() => {
    if (stopRunId && !sourceRef.current) watchRun(stopRunId);
  }, [stopRunId]);

  async function stopPipeline(runId) {
    if (!runId) return;
    setStopping(true);
    setError('');
    try {
      const res = await fetch('/api/pipeline/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not stop the pipeline');
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      setActiveRunId('');
      if (data.message) setError(data.message);
      await loadRuns();
    } catch (err) {
      setError(err.message);
    } finally {
      setStopping(false);
    }
  }

  async function startPipeline() {
    if (!accountId) return;
    setStarting(true);
    setError('');
    try {
      const res = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, dateFrom, dateTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start the pipeline');
      watchRun(data.runId);
      await loadRuns();
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function copyLogs() {
    if (!logs) return;
    try {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy the log.');
    }
  }

  const logLines = logs ? logs.split('\n').filter((line) => line.length > 0) : [];
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const rangeStart = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const liveState = starting || activeRunId || runningForAccount ? 'running' : 'idle';
  const selected = accounts.find((account) => account.id === accountId);
  const settled = liveState === 'running' || outcome?.account_id !== accountId ? null : outcome;
  const settledError = settled ? (runs.find((run) => run.id === settled.id)?.error_message || '') : '';
  return (
    <div className="pipe-page">
      <header className="pipe-head">
        <p className="pipe-kicker">Pipeline</p>
        <h1>Order Pipeline</h1>
        <p>Run order processing, monitor live progress, and review previous runs.</p>
      </header>

      <section className="stat-card pipe-control">
        <div className="pipe-start">
          <label className="field">
            <span className="field-label">Select account</span>
            <TypeSelect
              label="Account"
              value={accountId}
              options={accounts.length === 0 ? [{ id: '', label: 'No accounts yet' }] : accounts.map((account) => ({ id: account.id, label: account.name }))}
              onChange={setAccountId}
            />
          </label>
          <label className="field" htmlFor="pipeline-from">
            <span className="field-label">From date</span>
            <input id="pipeline-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="field" htmlFor="pipeline-to">
            <span className="field-label">End date</span>
            <input id="pipeline-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <button
            type="button"
            className="dash-primary pipe-start-btn"
            onClick={startPipeline}
            disabled={starting || stopping || !accountId || Boolean(runningForAccount)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            {starting ? 'Starting...' : 'Start Pipeline'}
          </button>
        </div>

        <div className="pipe-status-line" aria-live="polite">
          <span>
            <span className={`pipe-dot ${liveState === 'running' ? 'is-run' : 'is-idle'}`} />
            Status
            <strong>{historyState === 'loading' ? 'Checking' : (liveState === 'running' ? 'Running' : 'Idle')}</strong>
            <em>{liveState === 'running' ? (runningForAccount?.stage || 'In progress') : 'Not running'}</em>
          </span>
          <span>
            Last run
            <strong>{historyState === 'loading' ? '…' : (lastRun ? statusLabel(lastRun.status, lastRun.cancelled) : '—')}</strong>
            <em>{lastRun ? formatWhen(lastRun.start_time) : 'No runs yet'}</em>
          </span>
          <span>
            Last sync
            <strong>{historyState === 'loading' ? '…' : (lastSuccess ? 'Success' : '—')}</strong>
            <em>{lastSuccess ? formatWhen(lastSuccess.end_time || lastSuccess.start_time) : 'Never synced'}</em>
          </span>
        </div>
      </section>

      {runningForAccount && !activeRunId && (
        <p className="notice notice-warn">
          A pipeline is already running for this account. Refresh this page in a moment, or wait about a minute if the last run crashed — stale runs clear automatically.
        </p>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {orderPicture && (
        <section className="stat-card order-picture" aria-live="polite">
          <h2 className="section-title">Orders in the last {orderPicture.days} days</h2>
          <p className="page-lead">{orderPicture.account}</p>
          <div className="metric-grid order-picture-grid">
            {orderPicture.rows.map((row) => (
              <article
                key={row.status}
                className={`metric-tile order-tile${row.status === 'awaiting_packaging' ? ' is-action' : ''}${row.count === 0 ? ' is-zero' : ''}`}
              >
                <p>{row.label}</p>
                <strong>{row.count}</strong>
                <span>{row.detail}</span>
              </article>
            ))}
          </div>
          <p className="order-picture-summary">{orderPicture.summary}</p>
        </section>
      )}

      <section className="stat-card pipe-live">
        <div className="pipe-live-head">
          <div>
            <h2>Live Run</h2>
            <span className={liveState === 'running' ? 'pipe-badge pipe-badge-run' : 'pipe-badge pipe-badge-muted'}>
              {liveState === 'running' ? 'Running' : 'Idle'}
            </span>
          </div>
          <Link href="/logs">View all logs</Link>
        </div>
        <div className="pipe-live-grid">
          <div className="pipe-term">
            <div className="pipe-term-bar">
              <span>Live logs{liveState === 'running' ? ' · streaming' : ''}</span>
              <button type="button" className="pipe-term-btn" onClick={copyLogs} disabled={!logs}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div ref={logRef} className="pipe-term-body" role="log" aria-live="polite">
              {logLines.length === 0 && <p className="pipe-term-empty">Logs appear here after you start a pipeline.</p>}
              {logLines.map((line, index) => {
                const entry = parseLogLine(line);
                return (
                  <p key={`${index}-${entry.text.slice(0, 24)}`} className={`pipe-line is-${entry.level}`}>
                    {entry.time && <time>{entry.time}</time>}
                    <span className="pipe-level">{entry.level === 'plain' ? '' : entry.level}</span>
                    <span>{entry.text}</span>
                  </p>
                );
              })}
            </div>
          </div>

          <aside className="pipe-side">
            {liveState === 'running' ? (
              <>
                <h3>Pipeline in progress</h3>
                <p>Running for {selected?.name || 'the selected account'}.</p>
                <dl>
                  <div><dt>Started</dt><dd>{runningForAccount ? formatWhen(runningForAccount.start_time) : '—'}</dd></div>
                  <div><dt>Stage</dt><dd>{runningForAccount?.stage || '—'}</dd></div>
                  <div><dt>Status</dt><dd>Running</dd></div>
                </dl>
                {stopRunId && (
                  <button type="button" className="pipe-stop" onClick={() => stopPipeline(stopRunId)} disabled={stopping}>
                    {stopping ? 'Stopping...' : 'Stop pipeline'}
                  </button>
                )}
              </>
            ) : settled ? (
              <>
                <h3>{statusLabel(settled.status, settled.cancelled)}</h3>
                <p>{settledError || 'This run has finished.'}</p>
                <dl>
                  <div><dt>Started</dt><dd>{formatWhen(settled.start_time)}</dd></div>
                  <div><dt>Finished</dt><dd>{formatWhen(settled.end_time)}</dd></div>
                  <div><dt>Stage</dt><dd>{settled.stage || '—'}</dd></div>
                </dl>
              </>
            ) : (
              <>
                <span className="pipe-side-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                </span>
                <h3>No run in progress</h3>
                <p>Start a pipeline to see live progress here.</p>
              </>
            )}
          </aside>
        </div>
      </section>

      <section className="stat-card pipe-history">
        <div className="pipe-live-head">
          <div>
            <h2>Run history</h2>
            <p>Previous runs for every account.</p>
          </div>
        </div>
        {historyState === 'error' && <p className="notice notice-error" role="alert">{historyError}</p>}
        <div className="table-wrap">
          <table className="data-table pipe-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Account</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Duration</th>
                <th>Orders</th>
                <th>Files</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {historyState === 'loading' && (
                <tr><td colSpan="8" className="empty-cell">Loading runs...</td></tr>
              )}
              {historyState === 'ready' && runs.length === 0 && (
                <tr><td colSpan="8" className="empty-cell">No runs yet. Start a pipeline to see history here.</td></tr>
              )}
              {historyState === 'error' && runs.length === 0 && (
                <tr><td colSpan="8" className="empty-cell">Run history could not be loaded.</td></tr>
              )}
              {runs.map((run) => {
                const message = run.error_message || '';
                const short = message.length > 72 ? `${message.slice(0, 72)}…` : message;
                return (
                  <tr key={run.id}>
                    <td>{formatWhen(run.start_time)}</td>
                    <td>{run.account_name || '—'}</td>
                    <td><span className={badgeClass(run.status, run.cancelled)}>{statusLabel(run.status, run.cancelled)}</span></td>
                    <td>{run.stage || '—'}</td>
                    <td>{run.duration || '—'}</td>
                    <td>{run.orders_processed == null ? '—' : run.orders_processed}</td>
                    <td>
                      {(run.files || []).length === 0 && '—'}
                      {(run.files || []).map((file) => (
                        <a key={file.name} href={file.url} className="file-link pipe-file" title={file.name}>{file.name}</a>
                      ))}
                    </td>
                    <td className="pipe-error-cell">
                      {message ? (
                        <>
                          <span title={message}>{short}</span>
                          {message.length > 72 && (
                            <button type="button" className="pipe-details" onClick={() => setErrorRun(run)}>Details</button>
                          )}
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {historyState === 'ready' && total > 0 && (
          <ListPager
            label="Run history pages"
            page={page}
            pageCount={pageCount}
            start={rangeStart}
            end={rangeEnd}
            total={total}
            noun="runs"
            onPage={setPage}
          />
        )}
      </section>

      {errorRun && <ErrorDetails run={errorRun} onClose={() => setErrorRun(null)} />}
    </div>
  );
}
