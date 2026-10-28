'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

const PAGE_SIZE = 10;

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

function pageList(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const numbers = [1, pageCount, page - 1, page, page + 1].filter((number) => number >= 1 && number <= pageCount);
  const unique = [...new Set(numbers)].sort((left, right) => left - right);
  const items = [];
  unique.forEach((number, index) => {
    if (index > 0 && number - unique[index - 1] > 1) items.push(`gap-${number}`);
    items.push(number);
  });
  return items;
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

export default function CatalogBoard({ runs, active }) {
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState('all');
  const [status, setStatus] = useState('all');
  const [date, setDate] = useState('any');
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState('');
  const menuRef = useRef(null);

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
    setPage(1);
  }, [search, account, status, date]);

  useEffect(() => {
    function close(event) {
      if (!menuRef.current?.contains(event.target)) setMenuId('');
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const counts = {
    total: filtered.length,
    ready: filtered.filter((run) => run.status === 'awaiting_confirm').length,
    completed: filtered.filter((run) => run.status === 'completed').length,
    failed: filtered.filter((run) => run.status === 'failed').length,
  };
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = filtered.length === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
  const end = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const rows = filtered.slice(start === 0 ? 0 : start - 1, end);

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

      {active ? (
        <p className="catalog-live" role="status">
          <span className="catalog-spinner" aria-hidden="true" />
          Run in progress for {active.accountName}. <Link href={`/catalog/runs/${active.runId}`}>{active.title}</Link>
        </p>
      ) : null}

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
        <select value={account} onChange={(event) => setAccount(event.target.value)} aria-label="Account">
          <option value="all">All accounts</option>
          {accounts.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
          <option value="all">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
        </select>
        <select value={date} onChange={(event) => setDate(event.target.value)} aria-label="Date">
          {DATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>

      <div className="table-wrap catalog-table-wrap">
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
                      <div className="catalog-menu-pop" role="menu">
                        <Link href={`/catalog/runs/${run.runId}`} role="menuitem">Open run</Link>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="pipe-pager catalog-pager" aria-label="Catalog pages">
        <span>{filtered.length === 0 ? 'Showing 0 runs' : `Showing ${start}–${end} of ${filtered.length} runs`}</span>
        <div>
          <button type="button" className="pipe-page-btn" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>Previous</button>
          {pageList(currentPage, pageCount).map((item) => (
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                className={item === currentPage ? 'pipe-page-btn is-current' : 'pipe-page-btn'}
                onClick={() => setPage(item)}
                aria-current={item === currentPage ? 'page' : undefined}
              >
                {item}
              </button>
            ) : <span key={item}>…</span>
          ))}
          <button type="button" className="pipe-page-btn" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount}>Next</button>
        </div>
      </nav>
    </div>
  );
}
