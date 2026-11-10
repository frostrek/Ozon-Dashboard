'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TypeSelect from '../components/TypeSelect';
import { useBatchScroll } from '../hooks/useBatchScroll';
import ListPager from '../components/ListPager';

const EMPTY_FILTERS = {
  account: 'all',
  status: 'ALL',
  from: '',
  to: '',
  warehouse: '',
  q: '',
  sku: '',
};

function activeFilterCount(filters) {
  return ['account', 'status', 'from', 'to', 'warehouse', 'sku', 'q'].filter((key) => {
    const value = filters[key];
    return value && value !== 'all' && value !== 'ALL';
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

const SHIP_CHUNK = 20;

function saveBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function savePdfUrl(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'thermal-labels.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function requestDocument(kind, orderIds, lines, postingNumbers) {
  const response = await fetch('/api/labels/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, orderIds, lines, postingNumbers }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Ozon did not return the document.');
  }
  return {
    bytes: await response.arrayBuffer(),
    note: response.headers.get('X-Document-Note') || '',
    printed: Number(response.headers.get('X-Printed-Count') || 0),
    requested: Number(response.headers.get('X-Requested-Count') || 0),
  };
}

async function mergePdfBuffers(buffers) {
  const files = buffers.filter((item) => item && item.byteLength);
  if (!files.length) throw new Error('Ozon did not return a shipping-label PDF.');
  if (files.length === 1) return files[0];
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const bytes of files) {
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return merged.save();
}

async function downloadDocument(kind, orderIds, lines, postingNumbers = [], onProgress) {
  if (kind === 'shipping' && postingNumbers.length > SHIP_CHUNK) {
    const buffers = [];
    const notes = [];
    let printed = 0;
    for (let index = 0; index < postingNumbers.length; index += SHIP_CHUNK) {
      const chunk = postingNumbers.slice(index, index + SHIP_CHUNK);
      const doneCount = Math.min(index + chunk.length, postingNumbers.length);
      const pct = Math.round((doneCount / postingNumbers.length) * 100);
      onProgress?.(doneCount, postingNumbers.length, pct);
      const chunkLines = lines.filter((line) => chunk.includes(line.postingNumber));
      const chunkIds = [...new Set(chunkLines.map((line) => line.orderId).filter(Boolean))];
      const part = await requestDocument('shipping', chunkIds, chunkLines, chunk);
      buffers.push(part.bytes);
      printed += part.printed || (part.bytes?.byteLength ? chunk.length : 0);
      if (part.note) notes.push(part.note);
    }
    saveBlob(new Blob([await mergePdfBuffers(buffers)], { type: 'application/pdf' }), 'ozon-shipping-labels.pdf');
    if (printed < postingNumbers.length) {
      return notes[0] || `Printed ${printed} of ${postingNumbers.length} shipping labels.`;
    }
    return `Downloaded ${printed} shipping labels.`;
  }

  onProgress?.(postingNumbers.length || lines.length, postingNumbers.length || lines.length);
  const part = await requestDocument(kind, orderIds, lines, postingNumbers);
  const filename = kind === 'shipping' ? 'ozon-shipping-labels.pdf' : 'ozon-product-list.pdf';
  saveBlob(new Blob([part.bytes], { type: 'application/pdf' }), filename);
  if (kind === 'shipping' && part.requested && part.printed < part.requested) {
    return part.note || `Printed ${part.printed} of ${part.requested} shipping labels.`;
  }
  return part.note;
}

export default function DocumentPicker({ onMessage, onGenerated }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [accounts, setAccounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [quickTab, setQuickTab] = useState('ALL');
  const [selected, setSelected] = useState(() => new Set());
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState('');
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Optimization 3: Instant in-memory tab switching (0ms delay)
  function setQuickStatus(nextStatus) {
    setQuickTab(nextStatus);
  }

  const products = useMemo(() => {
    if (!quickTab || quickTab === 'ALL') return rawProducts;
    return rawProducts.filter((row) => row.status === quickTab);
  }, [rawProducts, quickTab]);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      // Don't send status to server if user is using quick tabs
      if (key === 'status') return;
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
        setRawProducts(data.products || []);
        setSelected(new Set());
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
      const allKeys = products.map((row) => row.key);
      const allSelected = allKeys.length > 0 && allKeys.every((key) => current.has(key));
      return allSelected ? new Set() : new Set(allKeys);
    });
  }

  async function download(kind) {
    const chosen = products.filter((row) => selected.has(row.key));
    if (!chosen.length || busy) return;
    const postings = [...new Set(chosen.map((row) => row.postingNumber).filter(Boolean))];
    setBusy(kind);
    setProgressPercent(15);
    setProgressStage(kind === 'shipping' ? `Starting download for ${postings.length} shipping labels...` : 'Rendering product list with photos...');
    try {
      const message = await downloadDocument(
        kind,
        [...new Set(chosen.map((row) => row.orderId))],
        chosen.map((row) => ({
          orderId: row.orderId,
          sku: row.sku,
          name: row.name,
          quantity: row.quantity,
          postingNumber: row.postingNumber,
          warehouse: row.warehouse,
        })),
        postings,
        (done, total, pct) => {
          setProgressPercent(pct || Math.round((done / total) * 100));
          setProgressStage(`Downloading labels: ${done} of ${total} completed`);
        },
      );
      setProgressPercent(100);
      setProgressStage('Download complete!');
      onMessage?.(message || (kind === 'shipping'
        ? `Downloaded ${postings.length} shipping labels.`
        : `Downloaded product list with ${chosen.length} products.`));
    } catch (err) {
      onMessage?.(err.message, 'error');
    } finally {
      setTimeout(() => {
        setBusy('');
        setProgressStage('');
        setProgressPercent(0);
      }, 700);
    }
  }

  // Optimization 1: 1-Click Direct 4x6 Thermal Label Generation
  async function generateDirectThermalLabels() {
    const chosen = products.filter((row) => selected.has(row.key));
    if (!chosen.length || busy) return;
    const postings = [...new Set(chosen.map((row) => row.postingNumber).filter(Boolean))];
    const orderIds = [...new Set(chosen.map((row) => row.orderId))];
    const lines = chosen.map((row) => ({
      orderId: row.orderId,
      sku: row.sku,
      name: row.name,
      quantity: row.quantity,
      postingNumber: row.postingNumber,
      warehouse: row.warehouse,
    }));

    setBusy('direct');
    setProgressStage('Step 1/3: Packing orders & fetching Ozon shipping labels...');
    setProgressPercent(20);

    try {
      // 1. Fetch Shipping Labels (chunked if > SHIP_CHUNK)
      let shippingBuffer;
      if (postings.length > SHIP_CHUNK) {
        const buffers = [];
        for (let i = 0; i < postings.length; i += SHIP_CHUNK) {
          const chunk = postings.slice(i, i + SHIP_CHUNK);
          const done = Math.min(i + chunk.length, postings.length);
          const pct = Math.round(20 + (done / postings.length) * 35);
          setProgressPercent(pct);
          setProgressStage(`Step 1/3: Fetching shipping labels (${done} of ${postings.length})...`);
          const chunkLines = lines.filter((l) => chunk.includes(l.postingNumber));
          const chunkIds = [...new Set(chunkLines.map((l) => l.orderId).filter(Boolean))];
          const part = await requestDocument('shipping', chunkIds, chunkLines, chunk);
          buffers.push(part.bytes);
        }
        shippingBuffer = await mergePdfBuffers(buffers);
      } else {
        const part = await requestDocument('shipping', orderIds, lines, postings);
        shippingBuffer = part.bytes;
      }

      // 2. Fetch Product List PDF
      setProgressStage('Step 2/3: Rendering translated product list with photos...');
      setProgressPercent(65);
      const productPart = await requestDocument('product', orderIds, lines, postings);
      const productBuffer = productPart.bytes;

      // 3. Send both to /api/labels/process
      setProgressStage('Step 3/3: Stitching 4×6 thermal labels with barcodes...');
      setProgressPercent(85);

      const formData = new FormData();
      formData.append('shippingLabel', new Blob([shippingBuffer], { type: 'application/pdf' }), 'shipping-labels.pdf');
      formData.append('productList', new Blob([productBuffer], { type: 'application/pdf' }), 'product-list.pdf');

      const processRes = await fetch('/api/labels/process', { method: 'POST', body: formData });
      const processData = await processRes.json().catch(() => ({}));
      if (!processRes.ok) throw new Error(processData.error || 'Failed to compile 4x6 thermal labels.');

      setProgressPercent(100);
      setProgressStage('Labels compiled successfully!');

      const labelCount = processData.labelCount || postings.length;
      onMessage?.(`Generated ${labelCount} thermal labels! Ready to print.`);
      onGenerated?.(processData);

      if (processData.downloadUrl) {
        savePdfUrl(processData.downloadUrl, processData.filename || 'thermal-labels.pdf');
      }
    } catch (err) {
      console.error('Direct thermal label generation failed:', err);
      onMessage?.(err.message || 'Could not compile thermal labels.', 'error');
    } finally {
      setTimeout(() => {
        setBusy('');
        setProgressStage('');
        setProgressPercent(0);
      }, 700);
    }
  }

  const scroll = useBatchScroll({
    initialItems: products,
    initialTotal: products.length,
    resetKey: `${filters.account}|${filters.status}|${filters.from}|${filters.to}|${filters.warehouse}|${filters.q}|${filters.sku}|${products.length}`,
    itemKey: 'key',
    pageMode: true,
  });
  const pageRows = scroll.items;
  const allChecked = products.length > 0 && products.every((row) => selected.has(row.key));
  const someChecked = selected.size > 0 && !allChecked;
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  return (
    <section className="stat-card label-picker">
      <div className="label-panel-head">
        <div>
          <h2>Download from Ozon</h2>
        </div>
      </div>

      {/* Top Quick Filter Tabs */}
      <div className="label-tabs-row">
        <div className="label-status-tabs" role="tablist" aria-label="Order status filter">
          <button
            type="button"
            className={`label-tab-pill ${(quickTab || 'ALL') === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setQuickStatus('ALL')}
          >
            All Orders
          </button>
          <button
            type="button"
            className={`label-tab-pill is-pack ${quickTab === 'AWAITING_PACKAGING' ? 'is-active' : ''}`}
            onClick={() => setQuickStatus('AWAITING_PACKAGING')}
          >
            <span className="label-pill-dot is-amber" aria-hidden="true" />
            Ready to Pack
          </button>
          <button
            type="button"
            className={`label-tab-pill is-deliver ${quickTab === 'AWAITING_DELIVERY' ? 'is-active' : ''}`}
            onClick={() => setQuickStatus('AWAITING_DELIVERY')}
          >
            <span className="label-pill-dot is-teal" aria-hidden="true" />
            Waiting Pickup
          </button>
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
            Filter
            {activeFilterCount(filters) > 0 ? <span className="label-filter-count">{activeFilterCount(filters)}</span> : null}
          </button>

          <div className="label-counts-inline">
            <span>
              {state === 'loading'
                ? 'Loading orders...'
                : `${products.length} product${products.length === 1 ? '' : 's'}${selected.size ? ` · ${selected.size} selected` : ''}`}
            </span>
            {products.length > 0 ? (
              <button type="button" className="label-select-all" onClick={toggleAll}>
                {allChecked ? 'Clear selection' : 'Select all'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="label-actions-group">
          {/* Optimization 1: 1-Click Direct 4x6 Thermal Label Button */}
          <button
            type="button"
            className="dash-primary label-btn-direct"
            disabled={!selected.size || Boolean(busy)}
            onClick={generateDirectThermalLabels}
            title="Automatically fetch Ozon labels, merge product photos, and compile 4x6 thermal labels"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>{busy === 'direct' ? 'Compiling 4×6 Labels...' : '⚡ Generate 4×6 Thermal Labels'}</span>
          </button>

          <button
            type="button"
            className="dash-outline label-btn-ship"
            disabled={!selected.size || Boolean(busy)}
            onClick={() => download('shipping')}
          >
            {busy === 'shipping' ? 'Downloading...' : 'Download Shipping Labels'}
          </button>
          <button
            type="button"
            className="dash-outline"
            disabled={!selected.size || Boolean(busy)}
            onClick={() => download('product')}
          >
            {busy === 'product' ? 'Downloading...' : 'Download Product List'}
          </button>
        </div>
      </div>

      {/* Optimization 3: Visual Batch Progress Bar */}
      {busy ? (
        <div className="label-progress-box" role="status" aria-live="polite">
          <div className="label-progress-header">
            <span className="label-progress-title">
              <span className="pipe-spinner-sm" aria-hidden="true" />
              {progressStage || 'Processing batch...'}
            </span>
            <span className="label-progress-pct">{progressPercent}%</span>
          </div>
          <div className="label-progress-track">
            <div
              className="label-progress-fill"
              style={{ width: `${Math.max(5, Math.min(100, progressPercent))}%` }}
            />
          </div>
        </div>
      ) : null}

      {filtersOpen ? (
        <form id="label-filters" className="label-filters" onSubmit={applyFilters}>
          <label>
            <span>Account</span>
            <TypeSelect
              label="Account"
              value={draft.account}
              options={[{ id: 'all', label: 'All accounts' }, ...accounts.map((account) => ({ id: account.id, label: account.name }))]}
              onChange={(next) => updateDraft('account', next)}
            />
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
            <TypeSelect
              label="Warehouse"
              value={draft.warehouse}
              options={[
                { id: '', label: 'All warehouses' },
                ...warehouses.map((place) => ({ id: place, label: place })),
                ...(draft.warehouse && !warehouses.includes(draft.warehouse) ? [{ id: draft.warehouse, label: draft.warehouse }] : []),
              ]}
              onChange={(next) => updateDraft('warehouse', next)}
            />
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

      <div className="table-wrap label-table-wrap" ref={scroll.tableWrapRef}>
        <table className="label-table">
          <thead>
            <tr>
              <th><input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all products" /></th>
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
                <td><span className={`label-status is-${String(row.status || '').toLowerCase().replace(/_/g, '-')}`}>{row.statusLabel}</span></td>
                <td>{row.warehouse || '—'}</td>
                <td>{shipBy(row.shipBy)}</td>
              </tr>
            ))}
            {state === 'ready' && products.length === 0 ? (
              <tr><td colSpan={8}>No orders are ready to pack or waiting for pickup.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {products.length > 0 ? (
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
  );
}
