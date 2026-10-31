'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useBatchScroll } from '../../../hooks/useBatchScroll';
import ListPager from '../../../components/ListPager';

const STATUS_LABEL = {
  ready: 'Ready to push',
  pushed: 'Successfully pushed',
  failed: 'Failed',
  review: 'Needs review',
  scraped: 'Scraped',
};

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function moneyInr(value) {
  const amount = Number(value);
  if (!(amount > 0)) return '—';
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function moneyUsd(value) {
  const amount = Number(value);
  if (!(amount > 0)) return '—';
  return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function plainMessage(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (/operation timed out|request timed out/i.test(value)) {
    return 'The connection timed out before this push finished. Nothing new was sent. Select the product and push again.';
  }
  return value;
}

function conditionApplied(run) {
  const bands = run?.weightBands || {};
  const bandOn = ['upto100', 'upto200', 'upto500', 'over500', 'unknown'].some((id) => Boolean(bands[id]));
  const rules = run?.scrapeRules || {};
  const custom = rules.custom && rules.custom.kind;
  return bandOn || Boolean(rules.inStockOnly || rules.skipSponsored || rules.skipUnrated || Number(rules.minRating) > 0 || custom);
}

function holdKind(reason) {
  const text = String(reason || '').toLowerCase();
  if (text.includes('missing')) return 'Missing weight';
  if (text.includes('over')) return 'Over limit';
  return 'Held back';
}

function ozonPushState(asin, run) {
  const key = String(asin || '').toUpperCase();
  if (!key) return '';
  if ((run.deletedAsins || []).some((value) => String(value || '').toUpperCase() === key)) return '';
  const taskItem = (run.tasks || [])
    .flatMap((task) => task.items || [])
    .find((entry) => String(entry.offerId || '').toUpperCase() === key);
  if (taskItem?.status === 'deleted') return '';
  if (taskItem?.status === 'failed') return 'failed';
  if (taskItem?.status === 'imported') return 'imported';
  if (taskItem) return 'sent';
  const saved = (run.pushedAsins || []).some((value) => String(value || '').toUpperCase() === key);
  if (saved) return 'sent';
  const marker = `PUSHED ${key}`;
  const logged = (run.logs || []).some((entry) => {
    const message = String(entry.message || '').toUpperCase();
    const at = message.indexOf(marker);
    if (at < 0) return false;
    const next = message[at + marker.length] || '';
    return !/[A-Z0-9-]/.test(next);
  });
  return logged ? 'sent' : '';
}

function confirmedStatus(item, run) {
  const asin = String(item.asin || '').toUpperCase();
  const sent = ozonPushState(asin, run);
  if (sent === 'imported' || sent === 'sent') return 'pushed';
  if (sent === 'failed') return 'failed';
  if ((run.errors || []).some((entry) => String(entry.asin || '').toUpperCase() === asin && entry.reason)) return 'failed';
  if (item.held) return 'review';
  if (run.status === 'awaiting_confirm') return 'ready';
  return 'scraped';
}

function stageModel(run) {
  const step = String(run.currentStep || '');
  const status = run.status;
  const scraped = Number(run.progress?.scraped) || 0;
  const ready = (run.preview || []).length;
  const pushed = (run.tasks || []).reduce((sum, task) => sum + (task.items || []).filter((item) => item.status === 'imported').length, 0)
    || Number(run.progress?.pushed) || 0;
  const pastScrape = scraped > 0 || /process|preview|push|task|completed|empty/.test(step) || status === 'awaiting_confirm' || status === 'completed';
  const previewReady = status === 'awaiting_confirm' || status === 'completed' || step.startsWith('push') || step === 'tasks' || (ready > 0 && status !== 'running');
  const pushing = step.startsWith('push') || (status === 'running' && step === 'tasks');
  const done = status === 'completed';
  const failedEarly = status === 'failed' && !pastScrape;
  const stages = [
    { id: 'scrape', label: 'Scraping', count: scraped, state: failedEarly ? 'failed' : pastScrape ? 'done' : 'current', detail: pastScrape ? 'Completed' : status === 'failed' ? 'Failed' : 'In progress' },
    { id: 'review', label: 'Ready for review', count: ready, state: failedEarly ? 'pending' : previewReady || done || pushing ? 'done' : pastScrape ? 'current' : 'pending', detail: previewReady || done ? 'Ready' : pastScrape ? 'In progress' : 'Pending' },
    { id: 'confirm', label: 'Waiting for confirmation', count: status === 'awaiting_confirm' ? ready : 0, state: done || pushing ? 'done' : status === 'awaiting_confirm' ? 'current' : 'pending', detail: status === 'awaiting_confirm' ? 'Needs confirmation' : done || pushing ? 'Confirmed' : 'Pending' },
    { id: 'push', label: 'Pushing to Ozon', count: pushed, state: done ? 'done' : pushing ? 'current' : status === 'failed' && step.startsWith('push') ? 'failed' : 'pending', detail: done ? 'Finished' : pushing ? 'In progress' : status === 'failed' && step.startsWith('push') ? 'Stopped' : 'Pending' },
    { id: 'done', label: 'Completed', count: done ? pushed : 0, state: done ? 'done' : 'pending', detail: done ? 'Completed' : status === 'failed' ? 'Stopped' : 'Pending' },
  ];
  return stages;
}

function ProductThumb({ src, title }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="thumb thumb-empty" aria-hidden="true" />;
  return (
    <span className="thumb">
      <img src={src} alt="" loading="lazy" width="44" height="44" onError={() => setFailed(true)} />
      <span className="sr-only">{title}</span>
    </span>
  );
}

export default function RunLive({ initial, accounts = [] }) {
  const [run, setRun] = useState(initial);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState([]);
  const [copied, setCopied] = useState('');
  const [menuAsin, setMenuAsin] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeAsin, setRemoveAsin] = useState('');
  const [pushedSelected, setPushedSelected] = useState([]);
  const [openError, setOpenError] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(null);
  const [storageOpen, setStorageOpen] = useState(null);

  function dismissNote(kind, text, setter) {
    try {
      localStorage.setItem(`catalog-note:${initial.runId}:${kind}:${text}`, '1');
    } catch {
      /* private browsing can block storage; the note still closes for this view */
    }
    setter(false);
  }
  const waitingOnOzon = (run.tasks || []).some((task) => task.status === 'pending' || (task.items || []).some((item) => item.status === 'pending' || item.status === 'processing'));
  const jobActive = run.status === 'pending' || run.status === 'running' || ['push', 'resume', 'retry', 'tasks'].includes(busy);
  const live = jobActive || waitingOnOzon;

  useEffect(() => {
    function kept(kind, text) {
      if (!text) return false;
      try {
        return localStorage.getItem(`catalog-note:${initial.runId}:${kind}:${text}`) === '1';
      } catch {
        return false;
      }
    }
    setNoticeOpen(!kept('notice', run.notice));
    setStorageOpen(!kept('storage', run.storageNote));
  }, [initial.runId, run.notice, run.storageNote]);

  useEffect(() => {
    if (!menuAsin) return undefined;
    function closeMenu(event) {
      if (event.target.closest('[data-row-menu]')) return;
      setMenuAsin('');
    }
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [menuAsin]);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    async function tick() {
      try {
        const response = await fetch(`/api/catalog-jobs/${initial.runId}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!alive) return;
        if (!response.ok) {
          if (response.status === 404) setLoadError(data.error || 'This run is not on the server.');
          return;
        }
        setLoadError('');
        setRun(data);
        const waitingOnOzon = (data.tasks || []).some((task) => task.status === 'pending' || (task.items || []).some((item) => item.status === 'pending' || item.status === 'processing'));
        if (data.status !== 'pending' && data.status !== 'running' && !waitingOnOzon) {
          window.clearInterval(timer);
          setBusy('');
        }
      } catch {
        /* a dropped connection keeps the last status already on the page */
      }
    }
    if (!live) return undefined;
    tick();
    timer = window.setInterval(tick, 2500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [initial.runId, live]);

  async function continueRun(action, asins) {
    setActionError('');
    setBusy(action);
    try {
      const response = await fetch(`/api/catalog-jobs/${initial.runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, asins }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(data.error || 'The run could not be continued.');
        setBusy('');
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      setRun((current) => ({ ...current, status: 'pending', currentStep: action }));
    } catch {
      setActionError('The run could not be continued.');
      setBusy('');
    }
  }

  async function changeAccount(accountId) {
    if (!accountId || accountId === run.accountId) return;
    setActionError('');
    setBusy('account');
    try {
      const response = await fetch(`/api/catalog-jobs/${initial.runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'account', accountId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.status) {
        setActionError(data.error || 'The push account could not be changed.');
        return;
      }
      const chosen = accounts.find((account) => account.id === accountId);
      setRun((current) => ({
        ...current,
        ...data,
        accountId,
        accountName: data.accountName || chosen?.name || current.accountName,
      }));
    } catch {
      setActionError('The push account could not be changed.');
    } finally {
      setBusy('');
    }
  }

  async function deletePushed(asins) {
    const queue = (Array.isArray(asins) ? asins : [asins]).filter(Boolean);
    if (!queue.length) return;
    setActionError('');
    setBusy('remove');
    const removed = [];
    try {
      for (const asin of queue) {
        const response = await fetch(`/api/catalog-jobs/${initial.runId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove', asin }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setActionError(data.error || `Ozon did not delete ${asin}.`);
          break;
        }
        removed.push(asin);
      }
      const fresh = await fetch(`/api/catalog-jobs/${initial.runId}`, { cache: 'no-store' });
      const next = await fresh.json().catch(() => null);
      if (fresh.ok && next?.runId) setRun(next);
      setPushedSelected((current) => current.filter((id) => !removed.includes(id)));
      if (removed.length === queue.length) setRemoveAsin('');
    } catch {
      setActionError('Ozon did not delete this product.');
    } finally {
      setBusy('');
    }
  }

  const rows = useMemo(() => {
    const ready = (run.preview || []).map((item) => ({ ...item, held: false }));
    const held = (run.blocked || []).map((item) => ({ ...item, held: true }));
    return [...ready, ...held].map((item) => ({ ...item, uiStatus: confirmedStatus(item, run) }));
  }, [run]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const gateOn = conditionApplied(run);
    let next = rows.filter((item) => {
      if (item.previouslySaved || item.uiStatus === 'review' || item.uiStatus === 'pushed') return false;
      if (gateOn && item.held) return false;
      if (text && !`${item.name || ''} ${item.titleRu || ''} ${item.asin || ''} ${item.brand || ''}`.toLowerCase().includes(text)) return false;
      if (statusFilter !== 'all' && item.uiStatus !== statusFilter) return false;
      return true;
    });
    next = [...next].sort((a, b) => {
      if (sort === 'title') return String(a.name || a.titleRu || '').localeCompare(String(b.name || b.titleRu || ''));
      if (sort === 'weight') return (Number(a.weightGrams) || 0) - (Number(b.weightGrams) || 0);
      if (sort === 'price') return (Number(a.priceInr) || 0) - (Number(b.priceInr) || 0);
      return 0;
    });
    if (sort === 'newest') next.reverse();
    return next;
  }, [rows, query, statusFilter, sort]);

  const scroll = useBatchScroll({
    initialItems: filtered,
    initialTotal: filtered.length,
    resetKey: `${query}|${statusFilter}|${sort}`,
    itemKey: 'asin',
    pageMode: true,
  });

  const total = Number(run.progress?.scraped) || rows.length || 0;
  const readyCount = rows.filter((item) => !item.previouslySaved && !item.held && item.uiStatus !== 'pushed').length;
  const pushedRows = rows.filter((item) => item.uiStatus === 'pushed');
  const pushedCount = pushedRows.length;
  const pushedIds = pushedRows.map((item) => item.asin);
  const pushedChosen = pushedSelected.filter((asin) => pushedIds.includes(asin));
  const allPushedChecked = pushedIds.length > 0 && pushedIds.every((asin) => pushedChosen.includes(asin));
  const failedCount = Number(run.progress?.failed) || (run.errors || []).filter((item) => item.asin).length;
  const stats = [
    { key: 'scraped', label: 'Scraped products', value: Number(run.progress?.scraped) || 0, tone: 'blue' },
    { key: 'ready', label: 'Ready to push', value: readyCount, tone: 'cyan' },
    { key: 'pushed', label: 'Successfully pushed', value: pushedCount, tone: 'green' },
    { key: 'failed', label: 'Failed products', value: failedCount, tone: 'red' },
  ];
  const visible = scroll.items;
  const held = rows.filter((item) => item.held);
  const alreadyScraped = rows.filter((item) => item.previouslySaved && item.uiStatus !== 'pushed');
  const showHeld = conditionApplied(run);
  const eligibleSelected = selected.filter((asin) => rows.some((item) => item.asin === asin && !item.previouslySaved && !item.held && item.uiStatus !== 'pushed'));
  const canPush = ['awaiting_confirm', 'completed', 'failed'].includes(run.status) && !run.rateLimited && readyCount > 0;
  const actionsLocked = jobActive;
  const title = run.keyword || (run.mode === 'single' ? run.asin || 'Single product' : 'Catalog run');
  const logs = (run.logs || []).filter((entry) => {
    const level = String(entry.level || 'info').toLowerCase();
    const success = level === 'info' && /pushed|imported|saved/i.test(entry.message || '');
    const bucket = success ? 'success' : level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'info';
    if (logLevel !== 'all' && bucket !== logLevel) return false;
    if (logQuery.trim() && !String(entry.message || '').toLowerCase().includes(logQuery.trim().toLowerCase())) return false;
    return true;
  }).slice().reverse();

  async function copyText(value, key) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    } catch {
      setActionError('The browser blocked clipboard access.');
    }
  }

  function toggleAll(checked) {
    const ids = filtered.filter((item) => item.uiStatus !== 'pushed').map((item) => item.asin);
    setSelected((current) => (checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id))));
  }

  function selectEveryEligible() {
    setSelected(rows.filter((item) => !item.previouslySaved && !item.held && item.uiStatus !== 'pushed').map((item) => item.asin));
  }

  async function stopRun() {
    if (!window.confirm('Stop this run? Products already scraped stay on this page.')) return;
    setBusy('stop');
    setActionError('');
    try {
      const response = await fetch(`/api/catalog-jobs/${initial.runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.runId) {
        setActionError(data.error || 'This run could not be stopped.');
        return;
      }
      setRun((current) => ({ ...current, ...data, accountName: data.accountName || current.accountName }));
    } catch {
      setActionError('This run could not be stopped.');
    } finally {
      setBusy('');
    }
  }

  async function deleteRun() {
    if (!window.confirm('Delete this catalog run? Saved products stay in Scraped products.')) return;
    setBusy('delete-run');
    setActionError('');
    try {
      const response = await fetch(`/api/catalog-jobs/${initial.runId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(data.error || 'This run could not be deleted.');
        return;
      }
      window.location.href = '/catalog';
    } catch {
      setActionError('This run could not be deleted.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="run-page">
      <div className="run-main">
        <p className="crumbs">
          <Link href="/catalog">Catalog</Link>
          <span>/</span>
          <Link href="/catalog">Runs</Link>
          <span>/</span>
          <strong>{title}</strong>
        </p>

        <section className="run-hero card">
          <div className="run-identity">
            <span className="run-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></svg>
            </span>
    <div>
              <h1>{title}</h1>
              <p className="run-meta">{run.categoryLabel || 'Catalog'}{run.brand ? ` · ${run.brand}` : ''}</p>
              <p className="run-meta">
                <span>{run.accountName}</span>
                <span>{when(run.startedAt)}</span>
                <span className={`run-live run-live-${jobActive ? 'running' : run.status}`}>{jobActive ? 'Running' : canPush ? 'Ready to push' : run.status}</span>
          </p>
        </div>
          </div>
          <div className="run-hero-actions">
            <label className="account-switch">
              <span>Push account</span>
              <select
                aria-label="Push account"
                value={run.accountId || ''}
                disabled={jobActive || busy === 'account'}
                onChange={(event) => changeAccount(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
                {run.accountId && !accounts.some((account) => account.id === run.accountId) ? (
                  <option value={run.accountId}>Previous account removed</option>
                ) : null}
              </select>
            </label>
            <Link className="button-secondary" href="/catalog">View all runs</Link>
            {jobActive ? (
              <button type="button" className="button-secondary" disabled={busy === 'stop'} onClick={stopRun}>
                {busy === 'stop' ? 'Stopping...' : 'Stop run'}
              </button>
            ) : null}
            <button type="button" className="button-secondary" disabled={jobActive || busy === 'delete-run'} onClick={deleteRun}>
              {busy === 'delete-run' ? 'Deleting...' : 'Delete run'}
            </button>
            {canPush ? (
              <button type="button" className="dash-primary" disabled={actionsLocked || !eligibleSelected.length} onClick={() => setConfirmOpen(true)}>
                {eligibleSelected.length ? `Push selected (${eligibleSelected.length})` : 'Push to Ozon'}
              </button>
            ) : null}
            {run.resumable && run.status === 'failed' && !run.rateLimited ? (
              <button type="button" className="dash-primary" disabled={actionsLocked} onClick={() => continueRun('resume')}>
                {busy === 'resume' ? 'Resuming...' : 'Resume'}
              </button>
            ) : null}
            {run.retryCount && run.status !== 'awaiting_confirm' ? (
              <button type="button" className="button-secondary" disabled={actionsLocked} onClick={() => continueRun('retry')}>
                {busy === 'retry' ? 'Retrying...' : `Retry failed (${run.retryCount})`}
              </button>
            ) : null}
            {run.taskIds?.length ? (
              <button type="button" className="button-secondary" disabled={actionsLocked} onClick={() => continueRun('tasks')}>
                {busy === 'tasks' ? 'Checking...' : 'Refresh tasks'}
              </button>
            ) : null}
          </div>
        </section>

        <section className="stat-grid">
          {stats.map((stat) => {
            const pct = total > 0 ? Math.min(100, Math.round((stat.value / total) * 100)) : 0;
            return (
              <article key={stat.key} className={`stat-card stat-${stat.tone}`}>
                <header>
                  <span>{stat.label}</span>
                  <strong>{stat.value} / {total || stat.value}</strong>
                </header>
                <div className="stat-bar" aria-hidden="true"><span style={{ width: `${total ? pct : 0}%` }} /></div>
                <small>{total ? `${pct}%` : '—'}</small>
              </article>
            );
          })}
        </section>

        <ol className="pipe" aria-label="Catalog pipeline">
          {stageModel(run).map((stage) => (
            <li key={stage.id} data-state={stage.state}>
              <span className="pipe-dot" aria-hidden="true" />
              <div>
                <strong>{stage.label}</strong>
                <small>{stage.detail}</small>
                <em>{stage.count} products</em>
            </div>
            </li>
          ))}
        </ol>

        <section className="card table-card">
          <header className="table-tools">
            <h2>Scraped products ({filtered.length})</h2>
            <div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, ASIN, brand..." aria-label="Search products" />
              <select value={statusFilter} aria-label="Status" onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {Object.entries(STATUS_LABEL).filter(([value]) => value !== 'review').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={sort} aria-label="Sort" onChange={(event) => setSort(event.target.value)}>
                <option value="newest">Newest first</option>
                <option value="title">Title</option>
                <option value="weight">Weight</option>
                <option value="price">Price</option>
              </select>
        </div>
          </header>
          <p className="selection-bar">
            {eligibleSelected.length} selected to push
            <button type="button" onClick={selectEveryEligible}>Select all eligible ({readyCount})</button>
            <button type="button" onClick={() => setSelected([])}>Clear</button>
            <button type="button" onClick={() => copyText(eligibleSelected.join('\n'), 'selected')} disabled={!eligibleSelected.length}>{copied === 'selected' ? 'Copied' : 'Copy ASINs'}</button>
            {canPush ? (
              <button type="button" className="dash-primary" disabled={actionsLocked || !eligibleSelected.length} onClick={() => setConfirmOpen(true)}>
                {eligibleSelected.length ? `Push selected (${eligibleSelected.length})` : 'Push to Ozon'}
              </button>
            ) : null}
          </p>
          {live && !rows.length ? (
            <div className="catalog-skeleton" aria-busy="true" aria-label="Loading products"><span /><span /><span /></div>
          ) : (
            <div className="table-wrap run-table-scroll" ref={scroll.tableWrapRef}>
              <table className="data-table run-table">
              <thead>
                <tr>
                    <th><input type="checkbox" aria-label="Select all products" checked={filtered.some((item) => item.uiStatus !== 'pushed') && filtered.filter((item) => item.uiStatus !== 'pushed').every((item) => selected.includes(item.asin))} onChange={(event) => toggleAll(event.target.checked)} /></th>
                    <th>Image</th>
                    <th>Product title</th>
                  <th>ASIN</th>
                    <th>Brand</th>
                  <th>Weight</th>
                    <th>Price (INR)</th>
                    <th>Price (USD)</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan="10">{run.status === 'failed' && run.notice ? plainMessage(run.notice) : 'No products match this view.'}</td></tr>
                  ) : visible.map((item) => {
                    const detail = (run.errors || []).find((entry) => String(entry.asin || '').toUpperCase() === String(item.asin || '').toUpperCase());
                    return (
                  <tr key={item.asin}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={item.held ? `${item.asin} is held by the weight gate` : `Select ${item.asin} to push`}
                            checked={!item.held && selected.includes(item.asin)}
                            disabled={item.held || item.uiStatus === 'pushed'}
                            title={item.held ? 'Over 500 g or missing weight. This product is not pushed.' : 'Include this product in the push'}
                            onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.asin] : current.filter((id) => id !== item.asin))}
                          />
                        </td>
                        <td><ProductThumb src={item.imageUrl} title={item.name || item.titleRu || item.asin} /></td>
                        <td className="title-cell" title={item.name || item.titleRu || ''}>{item.name || item.titleRu || 'Untitled product'}</td>
                    <td>{item.asin}</td>
                        <td>{item.brand || '—'}</td>
                        <td>{Number(item.weightGrams) > 0 ? `${item.weightGrams} g` : '—'}</td>
                        <td>{moneyInr(item.priceInr)}</td>
                        <td>{moneyUsd(item.priceUsd)}</td>
                        <td>
                          <span className={`pill pill-${item.uiStatus}`}>{STATUS_LABEL[item.uiStatus]}</span>
                          {detail?.reason ? (
                            <button type="button" className="asin-copy" onClick={() => setOpenError((current) => current === item.asin ? '' : item.asin)}>
                              {openError === item.asin ? detail.reason : 'Details'}
                            </button>
                          ) : null}
                        </td>
                        <td className="menu-anchor" data-row-menu>
                          <button type="button" className="icon-btn" aria-label={`Actions for ${item.asin}`} onClick={() => setMenuAsin((current) => current === item.asin ? '' : item.asin)}>...</button>
                          {menuAsin === item.asin ? (
                            <div className="flyout flyout-left">
                              <button type="button" onClick={() => copyText(item.asin, item.asin)}>Copy ASIN</button>
                              {item.amazonUrl ? <a href={item.amazonUrl} target="_blank" rel="noreferrer">Open on Amazon</a> : null}
                            </div>
                          ) : null}
                        </td>
                  </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          )}
          {filtered.length > 0 ? (
            <ListPager
              label="Product pages"
              page={scroll.currentPage}
              pageCount={scroll.pageCount}
              start={scroll.rangeStart}
              end={scroll.rangeEnd}
              total={scroll.total}
              pageSize={10}
              noun="products"
              onPage={scroll.goToPage}
            />
          ) : null}
      </section>

        <section className="card table-card">
          <header className="table-tools">
            <h2>Already scraped ({alreadyScraped.length})</h2>
          </header>
          <p className="selection-bar">These products were already in the catalog before this run. They are not listed as new scrapes.</p>
          <div className="table-wrap panel-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product</th>
                  <th>ASIN</th>
                  <th>Brand</th>
                  <th>Weight</th>
                  <th>Price (INR)</th>
                </tr>
              </thead>
              <tbody>
                {alreadyScraped.length === 0 ? (
                  <tr><td colSpan="6">No products from this run were already in the catalog.</td></tr>
                ) : alreadyScraped.map((item) => (
                  <tr key={item.asin}>
                    <td><ProductThumb src={item.imageUrl} title={item.name || item.asin} /></td>
                    <td className="title-cell" title={item.name || item.titleRu || ''}>{item.name || item.titleRu || item.asin}</td>
                    <td>{item.asin}</td>
                    <td>{item.brand || '—'}</td>
                    <td>{Number(item.weightGrams) > 0 ? `${item.weightGrams} g` : '—'}</td>
                    <td>{moneyInr(item.priceInr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card table-card">
          <header className="table-tools">
            <h2>Pushed to Ozon ({pushedRows.length})</h2>
          </header>
          <p className="selection-bar">
            {pushedChosen.length} selected
            <button type="button" disabled={!pushedIds.length || jobActive} onClick={() => setPushedSelected(pushedIds)}>Select all</button>
            <button type="button" disabled={!pushedChosen.length} onClick={() => setPushedSelected([])}>Clear</button>
            <button type="button" className="row-delete" disabled={!pushedChosen.length || jobActive || busy === 'remove'} onClick={() => setRemoveAsin(pushedChosen.join(','))}>
              {pushedChosen.length ? `Delete selected (${pushedChosen.length})` : 'Delete selected'}
            </button>
          </p>
          <div className="table-wrap panel-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all pushed products"
                      checked={allPushedChecked}
                      disabled={!pushedIds.length || jobActive}
                      onChange={(event) => setPushedSelected(event.target.checked ? pushedIds : [])}
                    />
                  </th>
                  <th>Image</th>
                  <th>Product title</th>
                  <th>ASIN</th>
                  <th>Brand</th>
                  <th>Weight</th>
                  <th>Price (INR)</th>
                  <th>Price (USD)</th>
                  <th>Ozon</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pushedRows.length === 0 ? (
                  <tr><td colSpan="10">No products from this run have been pushed to Ozon yet.</td></tr>
                ) : pushedRows.map((item) => {
                  const sent = ozonPushState(item.asin, run);
                  const checked = pushedChosen.includes(item.asin);
                  return (
                  <tr key={item.asin}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.asin}`}
                          checked={checked}
                          disabled={jobActive || busy === 'remove'}
                          onChange={(event) => setPushedSelected((current) => (
                            event.target.checked ? [...new Set([...current, item.asin])] : current.filter((id) => id !== item.asin)
                          ))}
                        />
                      </td>
                      <td><ProductThumb src={item.imageUrl} title={item.name || item.titleRu || item.asin} /></td>
                      <td className="title-cell" title={item.name || item.titleRu || ''}>{item.name || item.titleRu || 'Untitled product'}</td>
                    <td>{item.asin}</td>
                      <td>{item.brand || '—'}</td>
                      <td>{Number(item.weightGrams) > 0 ? `${item.weightGrams} g` : '—'}</td>
                      <td>{moneyInr(item.priceInr)}</td>
                      <td>{moneyUsd(item.priceUsd)}</td>
                      <td><span className={`pill ${sent === 'imported' ? 'pill-pushed' : 'pill-ready'}`}>{sent === 'imported' ? 'Imported' : 'Sent to Ozon'}</span></td>
                      <td><button type="button" className="row-delete" disabled={jobActive || busy === 'remove'} onClick={() => setRemoveAsin(item.asin)}>Delete</button></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </section>

        <div className="pair-tables">
          {showHeld ? (
          <section className="card table-card">
            <header className="table-tools">
              <h2>Held by your conditions ({held.length})</h2>
            </header>
            <div className="table-wrap panel-table">
                    <table className="data-table">
                      <thead>
                        <tr>
                    <th>Image</th>
                    <th>Product</th>
                    <th>ASIN</th>
                    <th>Weight</th>
                    <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                  {held.length === 0 ? (
                    <tr><td colSpan="5">No products were held by the conditions on this run.</td></tr>
                  ) : held.map((item) => (
                    <tr key={item.asin}>
                      <td><ProductThumb src={item.imageUrl} title={item.name || item.asin} /></td>
                      <td className="title-cell" title={item.name || item.asin}>{item.name || item.asin}</td>
                      <td>{item.asin}</td>
                      <td>{Number(item.weightGrams) > 0 ? `${item.weightGrams} g` : '—'}</td>
                      <td><span className="pill pill-review">{holdKind(item.reason)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
          </section>
          ) : null}

          <section className="card table-card">
            <header className="table-tools">
              <h2>Execution logs</h2>
              <div className="log-tools">
                <input value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder="Search logs" aria-label="Search logs" />
                <select value={logLevel} aria-label="Log level" onChange={(event) => setLogLevel(event.target.value)}>
                  <option value="all">All levels</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </header>
            <div className="table-wrap panel-table">
            <table className="data-table">
              <thead>
                <tr>
                    <th>Time</th>
                    <th>Level</th>
                    <th>Message</th>
                </tr>
              </thead>
              <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan="3">No log lines for this filter.</td></tr>
                  ) : logs.map((entry, index) => {
                    const success = String(entry.level) === 'info' && /pushed|imported|saved/i.test(entry.message || '');
                    const level = success ? 'success' : String(entry.level || 'info');
                    return (
                      <tr key={`${entry.at}-${index}`}>
                        <td>{when(entry.at)}</td>
                        <td><span className={`log-badge log-${level}`}>{success ? 'SUCCESS' : level.toUpperCase()}</span></td>
                        <td className="log-message">{entry.message}</td>
                  </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
      </section>
        </div>
      </div>

      {confirmOpen ? (
        <div className="modal-back" role="presentation" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="push-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="push-title">Push selected products to Ozon</h2>
            <p>{eligibleSelected.length} selected product{eligibleSelected.length === 1 ? '' : 's'} will be sent to {run.accountName}. Products already in the catalog are not included.</p>
            <p>Only the checked products are pushed. A product is marked pushed only after Ozon accepts it.</p>
            <div className="modal-actions">
              <button type="button" className="button-secondary" onClick={() => setConfirmOpen(false)} disabled={!!busy}>Cancel</button>
              <button type="button" className="dash-primary" onClick={() => continueRun('push', eligibleSelected)} disabled={!!busy || !eligibleSelected.length}>
                {busy === 'push' ? 'Pushing...' : `Confirm ${eligibleSelected.length}`}
            </button>
            </div>
          </div>
      </div>
      ) : null}
      {(() => {
        const items = [
          loadError ? { id: 'load', tone: 'error', text: plainMessage(loadError), close: () => setLoadError('') } : null,
          actionError ? { id: 'action', tone: 'error', text: plainMessage(actionError), close: () => setActionError('') } : null,
          run.rateLimited ? { id: 'rate', tone: 'error', text: 'Ozon paused this account after too many requests. The run stopped immediately.' } : null,
          run.notice && noticeOpen ? { id: 'notice', tone: /timed out|fail|error|reject/i.test(run.notice) ? 'error' : 'info', text: plainMessage(run.notice), close: () => dismissNote('notice', run.notice, setNoticeOpen) } : null,
          run.storageNote && storageOpen ? { id: 'storage', tone: 'info', text: run.storageNote, close: () => dismissNote('storage', run.storageNote, setStorageOpen) } : null,
        ].filter(Boolean);
        if (!items.length) return null;
        return (
          <div className="toast-stack">
            {items.map((item) => (
              <div key={item.id} className={`app-toast app-toast-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
                <span className="app-toast-mark" aria-hidden="true">
                  {item.tone === 'error'
                    ? <svg viewBox="0 0 24 24"><path d="M12 8v5M12 17h.01" /></svg>
                    : <svg viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7" /></svg>}
                </span>
                <span className="app-toast-text">
                  {item.text}
                  {item.href ? <> <Link href={item.href}>{item.hrefLabel}</Link></> : null}
                </span>
                {item.close ? (
                  <button type="button" className="app-toast-close" onClick={item.close} aria-label="Dismiss">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        );
      })()}
      {removeAsin ? (
        <div className="modal-back" role="presentation" onClick={() => !busy && setRemoveAsin('')}>
          <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-title">{removeAsin.includes(',') ? 'Delete selected products from Ozon' : 'Delete this product from Ozon'}</h2>
            <p>
              {removeAsin.includes(',')
                ? `${removeAsin.split(',').length} selected products will be removed from Ozon. They leave the pushed list and can be pushed again later.`
                : `${removeAsin} will be removed from ${accounts.find((account) => account.id === (run.offerAccounts?.[removeAsin] || run.accountId))?.name || run.accountName} on Ozon. It leaves the pushed list and can be pushed again later.`}
            </p>
            <div className="modal-actions">
              <button type="button" className="button-secondary" onClick={() => setRemoveAsin('')} disabled={!!busy}>Cancel</button>
              <button type="button" className="row-delete" onClick={() => deletePushed(removeAsin.split(','))} disabled={!!busy}>
                {busy === 'remove' ? 'Deleting...' : 'Delete from Ozon'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
