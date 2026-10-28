'use client';

import { useEffect, useState } from 'react';

const PAGE_SIZE = 20;

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

const EMPTY_FILTERS = {
  account: 'all',
  status: 'AWAITING_DELIVERY',
  from: '',
  to: '',
  warehouse: '',
  q: '',
  sku: '',
};

function activeFilterCount(filters) {
  return ['account', 'from', 'to', 'warehouse', 'sku', 'q'].filter((key) => {
    const value = filters[key];
    return value && value !== 'all';
  }).length;
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16l-6 7.2V19l-4 2v-8.8L4 5z" />
    </svg>
  );
}

function shipBy(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function downloadDocument(kind, orderIds, lines) {
  const response = await fetch('/api/labels/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, orderIds, lines }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Ozon did not return the document.');
  }
  const blob = await response.blob();
  const note = response.headers.get('X-Document-Note') || '';
  const filename = kind === 'shipping' ? 'ozon-shipping-labels.pdf' : 'ozon-product-list.pdf';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  return note;
}

export default function DocumentPicker({ onMessage }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [accounts, setAccounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') params.set(key, value);
    });
    let cancelled = false;
    setState('loading');
    fetch(`/api/labels/orders?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load orders.');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setAccounts(data.accounts || []);
        setWarehouses(data.warehouses || []);
        setProducts(data.products || []);
        setSelected(new Set());
        setPage(1);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        onMessage?.(err.message, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      onMessage?.('The start date must be on or before the end date.', 'error');
      return;
    }
    setFilters(draft);
    setFiltersOpen(false);
  }

  function toggle(key) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      const pageKeys = pageRows.map((row) => row.key);
      const allOnPage = pageKeys.every((key) => next.has(key));
      pageKeys.forEach((key) => {
        if (allOnPage) next.delete(key);
        else next.add(key);
      });
      return next;
    });
  }

  async function download(kind) {
    const chosen = products.filter((row) => selected.has(row.key));
    if (!chosen.length || busy) return;
    setBusy(kind);
    try {
      const message = await downloadDocument(
        kind,
        [...new Set(chosen.map((row) => row.orderId))],
        chosen.map((row) => ({ orderId: row.orderId, sku: row.sku })),
      );
      onMessage?.(message || (kind === 'shipping' ? 'Shipping labels downloaded from Ozon.' : 'Product list downloaded.'));
    } catch (err) {
      onMessage?.(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rangeStart = products.length === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, products.length);
  const pageRows = products.slice(rangeStart === 0 ? 0 : rangeStart - 1, rangeEnd);
  const allChecked = pageRows.length > 0 && pageRows.every((row) => selected.has(row.key));

  return (
    <section className="stat-card label-picker">
      <div className="label-panel-head">
        <div>
          <h2>Download from Ozon</h2>
          <p>Only orders waiting for pickup are listed. Those are the orders Ozon can print a shipping label for.</p>
        </div>
      </div>

      <div className="label-picker-bar">
        <div className="label-filter-tools">
          <button
            type="button"
            className={`label-filter-btn${filtersOpen ? ' is-open' : ''}`}
            aria-expanded={filtersOpen}
            aria-controls="label-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <FilterIcon />
            Filters
            {activeFilterCount(filters) > 0 ? <span className="label-filter-count">{activeFilterCount(filters)}</span> : null}
          </button>
          <p>
          {state === 'loading'
            ? 'Loading orders...'
            : `${products.length} product${products.length === 1 ? '' : 's'}${selected.size ? ` · ${selected.size} selected` : ''}`}
          </p>
        </div>
        <div>
          <button type="button" className="dash-outline" disabled={!selected.size || Boolean(busy)} onClick={() => download('shipping')}>
            {busy === 'shipping' ? 'Downloading labels...' : 'Download shipping labels'}
          </button>
          <button type="button" className="dash-primary" disabled={!selected.size || Boolean(busy)} onClick={() => download('product')}>
            {busy === 'product' ? 'Downloading list...' : 'Download product list'}
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <form id="label-filters" className="label-filters" onSubmit={applyFilters}>
          <label>
            <span>Account</span>
            <select value={draft.account} onChange={(event) => updateDraft('account', event.target.value)}>
              <option value="all">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>From</span>
            <input type="date" value={draft.from} onChange={(event) => updateDraft('from', event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={draft.to} onChange={(event) => updateDraft('to', event.target.value)} />
          </label>
          <label>
            <span>Warehouse</span>
            <select value={draft.warehouse} onChange={(event) => updateDraft('warehouse', event.target.value)}>
              <option value="">All warehouses</option>
              {warehouses.map((place) => <option key={place} value={place}>{place}</option>)}
              {draft.warehouse && !warehouses.includes(draft.warehouse) ? <option value={draft.warehouse}>{draft.warehouse}</option> : null}
            </select>
          </label>
          <label>
            <span>Product or SKU</span>
            <input value={draft.sku} onChange={(event) => updateDraft('sku', event.target.value)} placeholder="Name or SKU" />
          </label>
          <label>
            <span>Posting or title</span>
            <input value={draft.q} onChange={(event) => updateDraft('q', event.target.value)} placeholder="Posting number or title" />
          </label>
          <button type="submit" className="dash-primary" disabled={state === 'loading'}>
            {state === 'loading' ? 'Applying...' : 'Apply filters'}
          </button>
        </form>
      ) : null}

      <div className="table-wrap label-table-wrap">
        <table className="label-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select products on this page" /></th>
              <th>Product</th>
              <th>SKU</th>
              <th>Quantity</th>
              <th>Posting</th>
              <th>Status</th>
              <th>Warehouse</th>
              <th>Ship by</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.key}>
                <td><input type="checkbox" checked={selected.has(row.key)} onChange={() => toggle(row.key)} aria-label={`Select ${row.name}`} /></td>
                <td className="label-product">
                  <strong title={row.name || ''}>{row.name}</strong>
                  <span>{row.accountName}</span>
                </td>
                <td>{row.sku || '—'}</td>
                <td>{row.quantity || '—'}</td>
                <td>{row.postingNumber}</td>
                <td><span className="label-status">{row.statusLabel}</span></td>
                <td>{row.warehouse || '—'}</td>
                <td>{shipBy(row.shipBy)}</td>
              </tr>
            ))}
            {state === 'ready' && products.length === 0 ? (
              <tr><td colSpan={8}>No orders are waiting for pickup.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {products.length > 0 ? (
        <nav className="pipe-pager label-pager" aria-label="Product pages">
          <span>Showing {rangeStart}–{rangeEnd} of {products.length}</span>
          <div>
            <button type="button" className="pipe-page-btn" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>
              Previous
            </button>
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
            <button type="button" className="pipe-page-btn" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount}>
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}
