'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { replaceQuery } from '../lib/replaceQuery';
import ListPager from '../components/ListPager';
import TypeSelect from '../components/TypeSelect';
import AddProductForm from './AddProductForm';
import BulkUpload from './BulkUpload';
import ImportReport from './ImportReport';

const TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'READY_FOR_SALE', label: 'Ready for sale' },
  { id: 'ERROR', label: 'Errors' },
  { id: 'FOR_IMPROVEMENT', label: 'For improvement' },
  { id: 'INACTIVE', label: 'Inactive' },
  { id: 'ARCHIVE', label: 'Archive' },
  { id: 'LOW_STOCK', label: 'Low stock' },
  { id: 'OUT_OF_STOCK', label: 'Out of stock' },
];

const FETCH_SIZE = 100;
const UI_BATCH = 10;

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

function firstImage(product) {
  const images = parseJson(product.images_json, []);
  return Array.isArray(images) && typeof images[0] === 'string' && images[0] ? images[0] : '';
}

function barcodeOf(product) {
  const attrs = parseJson(product.attributes_json, {});
  const value = attrs?.barcode ?? attrs?.barcodes ?? attrs?.ean;
  if (Array.isArray(value)) {
    const text = value.filter(Boolean).join(', ');
    return text || null;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function fmtPrice(price, currency) {
  if (price == null || Number.isNaN(Number(price))) return '—';
  const sym = currency === 'USD' ? '$' : currency === 'RUB' ? '₽' : currency === 'INR' ? '₹' : '';
  const amount = Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${amount} ${sym}` : amount;
}

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB');
}

function statusTone(product) {
  const label = String(product.status_name || '');
  if (product.status === 'ERROR' || /error|ошиб/i.test(label)) return 'bad';
  if (/improv|улучш/i.test(label)) return 'warn';
  if (product.status === 'ACTIVE' || /прода/i.test(label)) return 'ok';
  return 'muted';
}

function extractBaseProductName(name) {
  if (!name || typeof name !== 'string') return '';
  let clean = name.trim();
  // Strip trailing weight/volume e.g. " 250 g", " 100g", " 250ml", " 100 ml", " 1 kg", " 500 gm", etc.
  clean = clean.replace(/[,–-]?\s*\b\d+(?:\.\d+)?\s*(?:g|gm|gms|grams?|kg|kgs?|ml|l|ltr|litres?|oz|fl\s*oz)\b.*$/i, '');
  // Strip trailing pack counts e.g. " Pack of 2", " 2 pcs", " (Pack of 3)"
  clean = clean.replace(/[,–-]?\s*\(?\b(?:pack\s*of\s*\d+|\d+\s*pcs?|\d+\s*pieces?|\d+\s*pack)\b\)?.*$/i, '');
  // Strip trailing sizes e.g. ", Size M", " - Size XL"
  clean = clean.replace(/[,–-]?\s*\b(?:size\s*[:\s]*[a-z0-9]+)\b.*$/i, '');
  // Strip trailing punctuation
  clean = clean.replace(/[,–\-:/\\|\s]+$/, '').trim();
  return clean || name.trim();
}

function getProductGroupKey(product) {
  if (product.variant_group_id) {
    return `vg_${product.account_id}_${product.variant_group_id}`;
  }
  const attrs = parseJson(product.attributes_json, {});
  const attrGroupId = attrs?.variant_group_id || attrs?.model_group_name || attrs?.model_id;
  if (attrGroupId) {
    return `attr_vg_${product.account_id}_${attrGroupId}`;
  }
  const baseName = extractBaseProductName(product.name);
  const brand = (product.brand || '').toLowerCase().trim();
  if (baseName && baseName.length >= 3) {
    return `auto_${product.account_id}_${brand}_${baseName.toLowerCase()}`;
  }
  return `none_${product.id}`;
}

function ActionIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'sync' && <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v6h-6" />}
      {name === 'down' && <><path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M5 19h14" /></>}
      {name === 'up' && <><path d="M12 16V6" /><path d="M8 10l4-4 4 4" /><path d="M5 19h14" /></>}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'box' && <path d="M4 8l8-4 8 4-8 4-8-4zM4 8v8l8 4 8-4V8M12 12v8" />}
    </svg>
  );
}

function ProductImage({ product }) {
  const src = firstImage(product);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="prod-photo prod-photo-empty">No image</span>;
  return <img className="prod-photo" src={src} alt="" onError={() => setFailed(true)} />;
}

function DetailDrawer({ product, onClose, onDelete, onAddVariant }) {
  const [drawerTab, setDrawerTab] = useState('INFO');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  if (!product) return null;
  const images = parseJson(product.images_json, []);
  const attrs = parseJson(product.attributes_json, {});

  async function handlePush() {
    if (isPushing) return;
    setIsPushing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ozon did not accept this product.');
      setSyncMessage(`Ozon accepted the product. Import task ${data.taskId}.`);
    } catch (err) {
      setSyncMessage(err.message);
    } finally {
      setIsPushing(false);
    }
  }

  async function handleSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/products/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: product.account_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Product sync could not be started.');
      setSyncMessage('Sync started. It runs in the background.');
    } catch (err) {
      setSyncMessage(err.message);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <>
      <div className="prod-backdrop" onClick={onClose} />
      <aside className="prod-drawer" role="dialog" aria-modal="true" aria-labelledby="product-drawer-title">
        <div className="prod-drawer-head">
          <div>
            <h2 id="product-drawer-title">{product.name}</h2>
            <p>SKU {product.sku || '—'} · Ozon ID {product.ozon_id || '—'}</p>
          </div>
          <button type="button" className="prod-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="prod-drawer-tabs">
          <button type="button" className={drawerTab === 'INFO' ? 'is-on' : ''} onClick={() => setDrawerTab('INFO')}>Product info</button>
          <button type="button" className={drawerTab === 'AUDIT' ? 'is-on' : ''} onClick={() => setDrawerTab('AUDIT')}>Audit logs</button>
        </div>
        <div className="prod-drawer-body">
          {drawerTab === 'INFO' ? (
            <>
              <div className="prod-drawer-actions">
                <a className="dash-outline" href={`/products/${product.id}/edit`}>Edit listing</a>
                <button type="button" className="dash-primary" onClick={handlePush} disabled={isPushing || isSyncing}>
                  {isPushing ? 'Sending...' : 'Add to Ozon'}
                </button>
                <button type="button" className="dash-outline" onClick={handleSync} disabled={isSyncing || isPushing}>
                  {isSyncing ? 'Starting...' : 'Sync from Ozon'}
                </button>
                <button
                  type="button"
                  className="dash-outline"
                  onClick={() => onAddVariant && onAddVariant(product)}
                  title="Add another weight or size variant to this product"
                >
                  + Add Variant
                </button>
                <button type="button" className="prod-delete" onClick={() => onDelete(product)}>Delete</button>
              </div>
              {syncMessage && <p className="notice notice-warn">{syncMessage}</p>}
              <p className="prod-kicker">Images ({Array.isArray(images) ? images.length : 0})</p>
              <div className="prod-gallery">
                {Array.isArray(images) && images.length > 0
                  ? images.map((img, index) => <img key={`${img}-${index}`} src={img} alt="" />)
                  : <span className="label-empty">No images stored for this product.</span>}
              </div>
              <div className="prod-stock">
                <div><p>Available</p><strong>{product.stock == null ? '—' : product.stock}</strong></div>
                <div><p>Reserved</p><strong>{product.reserved_stock == null ? '—' : product.reserved_stock}</strong></div>
                <div><p>FBO</p><strong>{product.fbo_stock == null ? '—' : product.fbo_stock}</strong></div>
              </div>
              <dl className="prod-facts">
                <div><dt>Account</dt><dd>{product.account_name || '—'}</dd></div>
                <div><dt>Brand</dt><dd>{product.brand || '—'}</dd></div>
                <div><dt>Price</dt><dd>{fmtPrice(product.price, product.currency)}</dd></div>
                <div><dt>Rating</dt><dd>{product.rating == null ? '—' : product.rating}</dd></div>
                <div><dt>Content rating</dt><dd>{product.content_rating == null ? '—' : product.content_rating}</dd></div>
                <div><dt>Created</dt><dd>{fmtDate(product.ozon_created_at)}</dd></div>
                <div><dt>Barcode</dt><dd>{barcodeOf(product) || '—'}</dd></div>
                <div><dt>Category ID</dt><dd>{attrs.description_category_id || '—'}</dd></div>
                <div><dt>Model Group</dt><dd>{product.variant_group_id || attrs.model_group_name || '—'}</dd></div>
              </dl>
            </>
          ) : (
            <p className="label-empty">No audit logs are stored for this product.</p>
          )}
        </div>
      </aside>
    </>
  );
}

export default function ProductsClient({
  initialTab = 'ALL',
  initialAccount = 'all',
  initialList = 'all',
  initialQuery = '',
  accounts = [],
}) {
  const [fetched, setFetched] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [nextPage, setNextPage] = useState(2);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [filterAccount, setFilterAccount] = useState(initialAccount);
  const [listFilter, setListFilter] = useState(initialList);
  const [search, setSearch] = useState(initialQuery);
  const [selected, setSelected] = useState(null);
  const [selection, setSelection] = useState([]);
  const [showVariants, setShowVariants] = useState({});
  const [variantParent, setVariantParent] = useState(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadingRef = useRef(false);
  const requestId = useRef(0);
  const tableWrapRef = useRef(null);
  const latestRef = useRef({});
  const router = useRouter();
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncText, setSyncText] = useState('');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  latestRef.current = {
    fetched,
    total,
    nextPage,
    hasMore,
    activeTab,
    filterAccount,
    listFilter,
    search,
  };

  async function ensureLoadedThrough(targetCount) {
    let guard = 0;
    while (latestRef.current.fetched.length < targetCount && latestRef.current.hasMore && guard < 10) {
      if (loadingRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        continue;
      }
      const batch = await fetchBatch(latestRef.current.nextPage, false);
      if (!batch?.length) break;
      guard += 1;
    }
  }

  async function goToPage(page) {
    const pages = Math.max(1, Math.ceil((latestRef.current.total || 0) / UI_BATCH));
    const safe = Math.min(Math.max(1, page), pages);
    setCurrentPage(safe);
    await ensureLoadedThrough(safe * UI_BATCH);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function fetchBatch(page, replace) {
    if (!replace && loadingRef.current) return null;
    const id = requestId.current + 1;
    requestId.current = id;
    loadingRef.current = true;
    setLoadingPage(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(FETCH_SIZE),
        tab: activeTab === 'ALL' ? '' : activeTab,
        account: filterAccount === 'all' ? '' : filterAccount,
        list: listFilter === 'all' ? '' : listFilter,
        q: search,
      });
      const response = await fetch(`/api/products?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Products could not be loaded.');
      if (id !== requestId.current) return null;
      const incoming = Array.isArray(data.products) ? data.products : [];
      const counted = Number(data.total) || 0;
      setFetched((previous) => {
        if (replace) return incoming;
        const seen = new Set(previous.map((product) => product.id));
        return [...previous, ...incoming.filter((product) => !seen.has(product.id))];
      });
      setTotal(counted);
      setHasMore(page * FETCH_SIZE < counted && incoming.length > 0);
      setNextPage(page + 1);
      if (data.counts) setCounts(data.counts);
      if (replace) setCurrentPage(1);
      return incoming;
    } catch (error) {
      if (id !== requestId.current) return null;
      setLoadError(error.message || 'Products could not be loaded.');
      return null;
    } finally {
      if (id === requestId.current) {
        loadingRef.current = false;
        setLoadingPage(false);
      }
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setFetched([]);
      setCurrentPage(1);
      setHasMore(true);
      setNextPage(2);
      setSelection([]);
      replaceQuery('/products', {
        tab: activeTab === 'ALL' ? '' : activeTab,
        account: filterAccount === 'all' ? '' : filterAccount,
        list: listFilter === 'all' ? '' : listFilter,
        q: search,
      });
      fetchBatch(1, true);
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [activeTab, filterAccount, listFilter, search]);

  // Group all loaded products by variant / model key
  const allVariantGroups = useMemo(() => {
    const groups = {};
    fetched.forEach((product) => {
      const key = getProductGroupKey(product);
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });
    const ranked = Object.entries(groups).sort((left, right) => {
      const latest = (group) => Math.max(0, ...group.map((product) => new Date(product.ozon_created_at || product.created_at || 0).getTime() || 0));
      return latest(right[1]) - latest(left[1]);
    });
    return ranked;
  }, [fetched]);

  const totalGroups = allVariantGroups.length;
  const pageCount = Math.max(1, Math.ceil(totalGroups / UI_BATCH));
  const safePage = Math.min(currentPage, pageCount);
  const rangeStart = totalGroups === 0 ? 0 : ((safePage - 1) * UI_BATCH) + 1;
  const rangeEnd = Math.min(safePage * UI_BATCH, totalGroups);

  const pageGroups = useMemo(() => {
    const start = (safePage - 1) * UI_BATCH;
    return allVariantGroups.slice(start, start + UI_BATCH);
  }, [allVariantGroups, safePage]);

  const pageIds = pageGroups.flatMap(([, group]) => group.map((product) => product.id));
  const filtersActive = activeTab !== 'ALL' || filterAccount !== 'all' || listFilter !== 'all';

  function clearFilters() {
    setActiveTab('ALL');
    setFilterAccount('all');
    setListFilter('all');
    setSearch('');
  }

  function handleSelectAll(event) {
    if (event.target.checked) {
      setSelection((current) => [...new Set([...current, ...pageIds])]);
    } else {
      setSelection((current) => current.filter((id) => !pageIds.includes(id)));
    }
  }

  async function syncFromOzon() {
    if (syncing) return;
    setSyncing(true);
    setSyncText('Starting product sync.');
    setNotice('');
    try {
      const res = await fetch('/api/products/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: filterAccount === 'all' ? '' : filterAccount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Product sync could not be started.');
      const started = Date.now();
      while (Date.now() - started < 20 * 60 * 1000) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const statusRes = await fetch('/api/products/sync');
        const status = await statusRes.json().catch(() => ({}));
        setSyncText(status.message || 'Reading products from Ozon.');
        if (!status.running) {
          router.refresh();
          break;
        }
      }
    } catch (error) {
      setSyncText(error.message);
    } finally {
      setSyncing(false);
    }
  }

  async function sendProducts(productIds) {
    if (importing || !productIds.length) return;
    setImporting(true);
    setNotice('');
    setReport(null);
    try {
      const res = await fetch('/api/products/import/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.results) throw new Error(data.error || 'Ozon did not accept these products.');
      setReport(data);
      router.refresh();
    } catch (error) {
      setReport({ error: error.message, total: 0, success: 0, failed: 0, pending: 0, results: [] });
    } finally {
      setImporting(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget || removing) return;
    setRemoving(true);
    setRemoveError('');
    try {
      const res = await fetch(`/api/products/${removeTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'This product could not be removed from the page.');
      setSelection((current) => current.filter((id) => id !== removeTarget.id));
      setSelected((current) => (current?.id === removeTarget.id ? null : current));
      setFetched((current) => current.filter((product) => product.id !== removeTarget.id));
      setTotal((current) => Math.max(0, current - 1));
      setRemoveTarget(null);
      router.refresh();
    } catch (error) {
      setRemoveError(error.message);
    } finally {
      setRemoving(false);
    }
  }

  function toggleSelect(id) {
    setSelection((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  let empty = null;
  if (loadingPage && fetched.length === 0) {
    empty = null;
  } else if (fetched.length === 0 && total === 0 && !search.trim() && activeTab === 'ALL' && filterAccount === 'all' && listFilter === 'all') {
    empty = {
      title: 'No products yet',
      text: 'This page only shows products fetched from your Ozon seller account. A catalog push does not fill this list until Ozon has the product and you sync.',
      action: syncing ? 'Syncing...' : 'Sync from Ozon',
      onClick: syncFromOzon,
    };
  } else if (pageGroups.length === 0 && search.trim()) {
    empty = {
      title: 'No matching products',
      text: 'Nothing matches this search.',
      action: 'Clear search',
      onClick: () => setSearch(''),
    };
  } else if (pageGroups.length === 0) {
    empty = {
      title: 'No products in this view',
      text: 'The selected account or status has no matching products.',
      action: 'Clear filters',
      onClick: clearFilters,
    };
  }

  return (
    <div className="prod-page">
      <header className="prod-hero">
        <div>
          <p className="prod-kicker-page">Products</p>
          <h1>Products</h1>
          <p>Manage your Ozon catalog, monitor listing quality, and keep product information up to date.</p>
        </div>
        <div className="prod-hero-art" aria-hidden="true">
          <svg viewBox="0 0 180 92">
            <path d="M8 58c28-18 52-18 80 0s52 18 84 0" fill="none" stroke="#DBEAFE" strokeWidth="10" strokeLinecap="round" />
            <rect x="28" y="28" width="34" height="26" rx="4" fill="#F8FAFC" stroke="#93C5FD" />
            <rect x="48" y="18" width="34" height="26" rx="4" fill="#FFFFFF" stroke="#2563EB" />
            <path d="M118 22h28l10 12v24H118z" fill="#EFF6FF" stroke="#2563EB" />
            <path d="M124 22v12h22" fill="none" stroke="#2563EB" />
            <circle cx="128" cy="62" r="3" fill="#2563EB" />
            <circle cx="148" cy="62" r="3" fill="#2563EB" />
          </svg>
        </div>
      </header>
      {syncText && <p className="notice notice-warn" role="status">{syncText}</p>}
      {notice && <p className="notice notice-warn" role="status">{notice}</p>}
      <ImportReport
        report={report}
        busy={importing}
        onClose={() => setReport(null)}
        onRetry={() => sendProducts(report.results.filter((row) => row.status === 'failed' && row.productId).map((row) => row.productId))}
      />

      <section className="prod-board">
      <div className="prod-command">
        <p className="prod-count"><ActionIcon name="box" />{total.toLocaleString('en-US')} {total === 1 ? 'Product' : 'Products'}</p>
        <div className="prod-head-actions">
          <button type="button" className="dash-outline" onClick={syncFromOzon} disabled={syncing}>
            <ActionIcon name="sync" />
            {syncing ? 'Syncing...' : 'Sync from Ozon'}
          </button>
          <a className="dash-outline" href="/api/products/import/template"><ActionIcon name="down" />Download template</a>
          <button type="button" className="dash-outline" onClick={() => { setNotice(''); setUploading(true); }}><ActionIcon name="up" />Upload spreadsheet</button>
          <button type="button" className="dash-primary" onClick={() => { setNotice(''); setVariantParent(null); setAdding(true); }}><ActionIcon name="plus" />Add product</button>
        </div>
      </div>

      <div className="prod-tabs" role="tablist" aria-label="Product status">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'prod-tab is-on' : 'prod-tab'}
            onClick={() => { setActiveTab(tab.id); setCurrentPage(1); }}
          >
            <span className={`prod-dot is-${tab.id.toLowerCase()}`} aria-hidden="true" />
            {tab.label}
            <span className="prod-tab-count">{Number(counts[tab.id] || 0).toLocaleString('en-US')}</span>
          </button>
        ))}
      </div>

      <div className="prod-toolbar">
        <label className="prod-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }}
            placeholder="Search by name, article code, SKU, or barcode"
            aria-label="Search products"
          />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search">Clear</button>}
        </label>
        <TypeSelect
          label="Account"
          value={filterAccount}
          options={[{ id: 'all', label: 'All accounts' }, ...accounts.map((account) => ({ id: account.id, label: account.name }))]}
          onChange={(value) => { setFilterAccount(value); setCurrentPage(1); }}
        />
        <TypeSelect
          label="Products"
          value={listFilter}
          options={[
            { id: 'all', label: 'All products' },
            { id: 'listed', label: 'Just listed' },
            { id: 'selling', label: 'On sale' },
            { id: 'out', label: 'Out of stock' },
            { id: 'error', label: 'Errors' },
          ]}
          onChange={(value) => { setListFilter(value); setCurrentPage(1); }}
        />
        {(filtersActive || search) && (
          <button type="button" className="dash-outline prod-clear" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      <div className="prod-selection">
        <span>{selection.length.toLocaleString('en-US')} selected</span>
        {selection.length > 0 && (
          <button type="button" className="dash-primary" onClick={() => sendProducts(selection)} disabled={importing}>
            {importing ? 'Sending...' : 'Add to Ozon'}
          </button>
        )}
      </div>

      {loadingPage && fetched.length === 0 ? <p className="page-lead">Loading products…</p> : null}
      {loadError ? (
        <p className="notice notice-error" role="alert">
          {loadError}{' '}
          <button
            type="button"
            className="dash-outline"
            onClick={() => fetchBatch(fetched.length ? latestRef.current.nextPage : 1, fetched.length === 0)}
          >
            Retry
          </button>
        </p>
      ) : null}
      <div className="table-wrap prod-table-wrap" ref={tableWrapRef}>
        <table className="data-table prod-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all shown products"
                  onChange={handleSelectAll}
                  checked={pageIds.length > 0 && pageIds.every((id) => selection.includes(id))}
                />
              </th>
              <th>Product</th>
              <th>Name</th>
              <th>Status</th>
              <th>Price</th>
              <th>Warehouse</th>
              <th>Barcode</th>
              <th>Rating</th>
              <th>Content rating</th>
              <th>Creation date</th>
              <th><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {empty && (
              <tr>
                <td colSpan="11" className="prod-empty">
                  <strong>{empty.title}</strong>
                  <p>{empty.text}</p>
                  {empty.action && <button type="button" className="dash-outline" onClick={empty.onClick}>{empty.action}</button>}
                </td>
              </tr>
            )}
            {pageGroups.map(([groupId, group]) => {
              const main = group[0];
              const isVariantGroup = group.length > 1;
              const isOpen = showVariants[groupId];
              const barcode = barcodeOf(main);
              const baseTitle = isVariantGroup ? (extractBaseProductName(main.name) || main.name) : (main.name || '—');

              const prices = group.map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0);
              const minPrice = prices.length ? Math.min(...prices) : main.price;
              const maxPrice = prices.length ? Math.max(...prices) : main.price;
              const priceDisplay = isVariantGroup && minPrice !== maxPrice
                ? `${fmtPrice(minPrice, main.currency)} – ${fmtPrice(maxPrice, main.currency)}`
                : fmtPrice(main.price, main.currency);

              const totalStock = group.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
              const stockDisplay = isVariantGroup
                ? `${totalStock} in stock (${group.length} variants)`
                : `${main.stock == null ? '—' : main.stock}${main.reserved_stock == null ? '' : ` · reserved ${main.reserved_stock}`}`;

              return (
                <React.Fragment key={groupId}>
                  <tr className={group.some((p) => selection.includes(p.id)) ? 'is-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${main.name}`}
                        checked={group.every((p) => selection.includes(p.id))}
                        onChange={() => {
                          const allSelected = group.every((p) => selection.includes(p.id));
                          if (allSelected) {
                            setSelection((curr) => curr.filter((id) => !group.some((p) => p.id === id)));
                          } else {
                            setSelection((curr) => [...new Set([...curr, ...group.map((p) => p.id)])]);
                          }
                        }}
                      />
                    </td>
                    <td>
                      <div className="prod-sku">
                        <ProductImage product={main} />
                        <div>
                          <strong>{isVariantGroup ? `${group.length} Variants` : (main.sku || '—')}</strong>
                          <span>ID {main.ozon_id || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="prod-name">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <button type="button" title={main.name || ''} onClick={() => setSelected(main)}>
                          {baseTitle}
                        </button>
                        {isVariantGroup && (
                          <span style={{
                            background: '#E0F2FE',
                            color: '#0369A1',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            lineHeight: 1.4,
                          }}>
                            {group.length} variants
                          </span>
                        )}
                      </div>
                      {isVariantGroup && (
                        <button
                          type="button"
                          className="prod-variants"
                          onClick={() => setShowVariants({ ...showVariants, [groupId]: !isOpen })}
                          style={{ cursor: 'pointer', background: 'transparent', border: 'none', padding: '2px 0' }}
                        >
                          {isOpen ? '▲ Hide variants' : `▼ Show variants (${group.length})`}
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`prod-status is-${statusTone(main)}`}>
                        {main.status_name || main.status || '—'}
                      </span>
                    </td>
                    <td className="prod-price">{priceDisplay}</td>
                    <td className="prod-warehouse">{stockDisplay}</td>
                    <td className="prod-barcode" title={barcode || ''}>{barcode || '—'}</td>
                    <td className="prod-num">{main.rating == null ? '—' : main.rating}</td>
                    <td className="prod-num">{main.content_rating == null ? '—' : main.content_rating}</td>
                    <td className="prod-date">{fmtDate(main.ozon_created_at)}</td>
                    <td className="prod-row-actions">
                      <button type="button" className="prod-open" onClick={() => setSelected(main)}>Open</button>
                      <button
                        type="button"
                        className="dash-ghost"
                        style={{ fontSize: '12px', padding: '2px 6px', color: '#0369A1', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer' }}
                        title="Add a variant (new weight/size) to this product"
                        onClick={() => {
                          setVariantParent(main);
                          setAdding(true);
                        }}
                      >
                        + Variant
                      </button>
                      <button type="button" className="prod-delete" onClick={() => { setRemoveError(''); setRemoveTarget(main); }}>Delete</button>
                    </td>
                  </tr>
                  {isOpen && group.map((variant) => (
                    <tr key={variant.id} className="prod-variant" style={{ background: '#F8FAFC' }}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${variant.name}`}
                          checked={selection.includes(variant.id)}
                          onChange={() => toggleSelect(variant.id)}
                        />
                      </td>
                      <td>
                        <div className="prod-sku" style={{ paddingLeft: '20px' }}>
                          <ProductImage product={variant} />
                          <div>
                            <strong>{variant.sku || '—'}</strong>
                            <span style={{ fontSize: '11px', color: '#64748B' }}>Variant ID {variant.ozon_id || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="prod-name">
                        <button type="button" title={variant.name || ''} onClick={() => setSelected(variant)}>
                          {variant.name || '—'}
                        </button>
                      </td>
                      <td>
                        <span className={`prod-status is-${statusTone(variant)}`}>
                          {variant.status_name || variant.status || '—'}
                        </span>
                      </td>
                      <td className="prod-price">{fmtPrice(variant.price, variant.currency)}</td>
                      <td className="prod-warehouse">
                        {variant.stock == null ? '—' : `${variant.stock} in stock`}
                        {variant.reserved_stock ? ` · res ${variant.reserved_stock}` : ''}
                      </td>
                      <td className="prod-barcode">{barcodeOf(variant) || '—'}</td>
                      <td className="prod-num">{variant.rating == null ? '—' : variant.rating}</td>
                      <td className="prod-num">{variant.content_rating == null ? '—' : variant.content_rating}</td>
                      <td className="prod-date">{fmtDate(variant.ozon_created_at)}</td>
                      <td className="prod-row-actions">
                        <button type="button" className="prod-open" onClick={() => setSelected(variant)}>Open</button>
                        <button type="button" className="prod-delete" onClick={() => { setRemoveError(''); setRemoveTarget(variant); }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > 0 && !empty ? (
        <ListPager
          label="Product pages"
          page={safePage}
          pageCount={pageCount}
          start={rangeStart}
          end={rangeEnd}
          total={total}
          pageSize={UI_BATCH}
          noun="products"
          onPage={goToPage}
        />
      ) : null}
      </section>

      <DetailDrawer
        product={selected}
        onClose={() => setSelected(null)}
        onDelete={(product) => { setRemoveError(''); setRemoveTarget(product); }}
        onAddVariant={(p) => {
          setSelected(null);
          setVariantParent(p);
          setAdding(true);
        }}
      />
      {removeTarget && (
        <div className="confirm-backdrop" onClick={() => { if (!removing) setRemoveTarget(null); }}>
          <div className="confirm-card" role="dialog" aria-modal="true" aria-labelledby="remove-product-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="remove-product-title">Remove {removeTarget.name || 'this product'} from this page?</h2>
            <p>This removes the product from this page and from the Ozon seller account.</p>
            {removeError && <p className="notice notice-error" role="alert">{removeError}</p>}
            <div className="confirm-actions">
              <button type="button" className="dash-outline" disabled={removing} onClick={() => setRemoveTarget(null)}>Cancel</button>
              <button type="button" className="confirm-danger" disabled={removing} onClick={confirmRemove}>
                {removing ? 'Removing...' : 'Delete from Ozon'}
              </button>
            </div>
          </div>
        </div>
      )}
      {adding && (
        <AddProductForm
          accounts={accounts}
          existingProducts={fetched}
          initialParentProduct={variantParent}
          onClose={() => {
            setAdding(false);
            setVariantParent(null);
          }}
        />
      )}
      {uploading && (
        <BulkUpload
          accounts={accounts}
          onClose={() => setUploading(false)}
          onReport={(next) => {
            setReport(next);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
