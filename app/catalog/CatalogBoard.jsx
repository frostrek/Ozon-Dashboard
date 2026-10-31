'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import TypeSelect from '../components/TypeSelect';
import FloatPop from '../components/FloatPop';
import { useBatchScroll } from '../hooks/useBatchScroll';
import ListPager from '../components/ListPager';

const DATES = [
  { id: 'any', label: 'Any date' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
];

function statusLabel(status) {
  if (status === 'awaiting_confirm') return 'Ready to push';
  if (status === 'pending' || status === 'running') return 'In progress';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  return status || 'Pending';
}

function statusTone(status) {
  if (status === 'completed') return 'ok';
  if (status === 'failed') return 'bad';
  if (status === 'awaiting_confirm') return 'ready';
  if (status === 'pending' || status === 'running') return 'run';
  return 'muted';
}

function startedLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function inDateRange(value, range) {
  if (range === 'any') return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === 'today') return date >= start;
  if (range === 'week') start.setDate(start.getDate() - 6);
  if (range === 'month') start.setDate(start.getDate() - 29);
  return date >= start;
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'search' && <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'runs' && <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />}
      {name === 'ready' && <path d="M8 6l12 6-12 6V6z" />}
      {name === 'ok' && <path d="M5 12.5 9.2 17 19 7" />}
      {name === 'bad' && <path d="M7 7l10 10M17 7 7 17" />}
      {name === 'more' && <><circle cx="12" cy="6" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="18" r="1.2" /></>}
    </svg>
  );
}

function CatalogTabs({ current }) {
  return (
    <nav className="catalog-tabs" aria-label="Catalog sections">
      <Link href="/catalog" className={current === 'runs' ? 'is-on' : ''}>Runs</Link>
      <Link href="/catalog/scraped" className={current === 'scraped' ? 'is-on' : ''}>Scraped products</Link>
    </nav>
  );
}

export default function CatalogBoard({ runs }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState('');
  const [stopping, setStopping] = useState('');
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState('all');
  const [status, setStatus] = useState('all');
  const [date, setDate] = useState('any');
  const [menuId, setMenuId] = useState('');
  const menuRef = useRef(null);
  const menuPopRef = useRef(null);

  const accounts = useMemo(
    () => [...new Set(runs.map((run) => run.accountName).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [runs],
  );
  const statuses = useMemo(
    () => [...new Set(runs.map((run) => run.status).filter(Boolean))],
    [runs],
  );

  const filtered = useMemo(() => runs.filter((run) => {
    if (account !== 'all' && run.accountName !== account) return false;
    if (status !== 'all' && run.status !== status) return false;
    if (!inDateRange(run.startedAt, date)) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [run.title, run.accountName, run.asin].some((value) => String(value || '').toLowerCase().includes(needle));
  }), [runs, account, status, date, search]);

  useEffect(() => {
    function close(event) {
      if (menuRef.current?.contains(event.target) || menuPopRef.current?.contains(event.target)) return;
      setMenuId('');
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  async function stopRun(run) {
    if (!window.confirm(`Stop “${run.title}”? Products already scraped stay on the run.`)) return;
    setStopping(run.runId);
    try {
      const response = await fetch(`/api/catalog-jobs/${run.runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.error || 'This run could not be stopped.');
        return;
      }
      setMenuId('');
      router.refresh();
    } catch {
      window.alert('This run could not be stopped.');
    } finally {
      setStopping('');
    }
  }

  async function deleteRun(run) {
    if (run.status === 'pending' || run.status === 'running') return;
    if (!window.confirm(`Delete “${run.title}”? Products already saved stay in Scraped products.`)) return;
    setDeleting(run.runId);
    try {
      const response = await fetch(`/api/catalog-jobs/${run.runId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.error || 'This run could not be deleted.');
        return;
      }
      setMenuId('');
      router.refresh();
    } catch {
      window.alert('This run could not be deleted.');
    } finally {
      setDeleting('');
    }
  }

  const counts = {
    total: filtered.length,
    ready: filtered.filter((run) => run.status === 'awaiting_confirm').length,
    completed: filtered.filter((run) => run.status === 'completed').length,
    failed: filtered.filter((run) => run.status === 'failed').length,
  };
  const scroll = useBatchScroll({
    initialItems: filtered,
    initialTotal: filtered.length,
    resetKey: `${search}|${account}|${status}|${date}|${filtered.length}`,
    itemKey: 'runId',
    pageMode: true,
  });
  const rows = scroll.items;

  if (runs.length === 0) {
    return (
      <div className="catalog-board">
        <header className="catalog-hero">
          <div>
            <h1>Catalog</h1>
            <p>Manage Amazon-to-Ozon catalog runs and monitor publishing progress.</p>
          </div>
          <Link className="dash-primary catalog-new" href="/catalog/new"><Icon name="plus" />New run</Link>
        </header>
        <CatalogTabs current="runs" />
        <section className="catalog-empty">
          <h2>No catalog runs yet</h2>
          <p>Start a run to scrape products, preview the Russian titles and USD prices, and push the ones that match the weights you choose.</p>
          <Link className="dash-primary" href="/catalog/new">Start a run</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="catalog-board">
      <header className="catalog-hero">
        <div>
          <h1>Catalog</h1>
          <p>Manage Amazon-to-Ozon catalog runs and monitor publishing progress.</p>
        </div>
        <Link className="dash-primary catalog-new" href="/catalog/new"><Icon name="plus" />New run</Link>
      </header>
      <CatalogTabs current="runs" />

      {runs.filter((run) => run.status === 'pending' || run.status === 'running').map((run) => (
        <p className="catalog-live" role="status" key={run.runId}>
          <span className="catalog-spinner" aria-hidden="true" />
          <Link href={`/catalog/runs/${run.runId}`}>{run.title}</Link>
          {' '}is scraping for {run.accountName}. A new run can start while this one is going.
          <button type="button" className="button-secondary" disabled={stopping === run.runId} onClick={() => stopRun(run)}>
            {stopping === run.runId ? 'Stopping...' : 'Stop'}
          </button>
        </p>
      ))}

      <section className="catalog-stats" aria-label="Run totals">
        <article>
          <span className="catalog-stat-icon is-total"><Icon name="runs" /></span>
          <div><p>Total runs</p><strong>{counts.total}</strong></div>
        </article>
        <article>
          <span className="catalog-stat-icon is-ready"><Icon name="ready" /></span>
          <div><p>Ready to push</p><strong>{counts.ready}</strong></div>
        </article>
        <article>
          <span className="catalog-stat-icon is-ok"><Icon name="ok" /></span>
          <div><p>Completed</p><strong>{counts.completed}</strong></div>
        </article>
        <article>
          <span className="catalog-stat-icon is-bad"><Icon name="bad" /></span>
          <div><p>Failed</p><strong>{counts.failed}</strong></div>
        </article>
      </section>

      <div className="catalog-filters">
        <label className="catalog-search">
          <Icon name="search" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search keyword..."
            aria-label="Search keyword"
          />
        </label>
        <TypeSelect label="Account" value={account} options={[{ id: 'all', label: 'All accounts' }, ...accounts.map((name) => ({ id: name, label: name }))]} onChange={setAccount} />
        <TypeSelect label="Status" value={status} options={[{ id: 'all', label: 'All statuses' }, ...statuses.map((item) => ({ id: item, label: statusLabel(item) }))]} onChange={setStatus} />
        <TypeSelect label="Date" value={date} options={DATES} onChange={setDate} />
      </div>

      <div className="table-wrap catalog-table-wrap" ref={scroll.tableWrapRef}>
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Account</th>
              <th>Status</th>
              <th>Scraped</th>
              <th>Pushed</th>
              <th>Failed</th>
              <th>Started</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="catalog-empty-cell">No catalog runs match these filters.</td>
              </tr>
            ) : rows.map((run) => (
              <tr key={run.runId}>
                <td><Link className="catalog-keyword" href={`/catalog/runs/${run.runId}`}>{run.title}</Link></td>
                <td>{run.accountName}</td>
                <td><span className={`catalog-status is-${statusTone(run.status)}`}>{statusLabel(run.status)}</span></td>
                <td className="catalog-num">{run.scraped}</td>
                <td className="catalog-num">{run.pushed}</td>
                <td className="catalog-num">{run.failed}</td>
                <td className="catalog-when">{startedLabel(run.startedAt)}</td>
                <td className="catalog-actions">
                  <div className="catalog-menu" ref={menuId === run.runId ? menuRef : null}>
                    <button
                      type="button"
                      aria-label={`Actions for ${run.title}`}
                      aria-expanded={menuId === run.runId}
                      onClick={() => setMenuId((current) => (current === run.runId ? '' : run.runId))}
                    >
                      <Icon name="more" />
                    </button>
                    {menuId === run.runId ? (
                      <FloatPop anchorRef={menuRef} popRef={menuPopRef} className="catalog-menu-pop is-float" align="right" role="menu">
                        <Link href={`/catalog/runs/${run.runId}`} role="menuitem">Open run</Link>
                        {run.status === 'pending' || run.status === 'running' ? (
                          <button type="button" role="menuitem" disabled={stopping === run.runId} onClick={() => stopRun(run)}>
                            {stopping === run.runId ? 'Stopping...' : 'Stop run'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          disabled={deleting === run.runId || run.status === 'pending' || run.status === 'running'}
                          onClick={() => deleteRun(run)}
                        >
                          {deleting === run.runId ? 'Deleting...' : 'Delete run'}
                        </button>
                      </FloatPop>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 ? (
        <ListPager
          label="Catalog pages"
          page={scroll.currentPage}
          pageCount={scroll.pageCount}
          start={scroll.rangeStart}
          end={scroll.rangeEnd}
          total={scroll.total}
          pageSize={10}
          noun="runs"
          onPage={scroll.goToPage}
        />
      ) : null}
    </div>
  );
}
