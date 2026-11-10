'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { replaceQuery } from '../lib/replaceQuery';
import ListPager from '../components/ListPager';
import TypeSelect from '../components/TypeSelect';
import dynamic from 'next/dynamic';

const AddProductForm = dynamic(() => import('./AddProductForm'), { ssr: false });
const BulkUpload = dynamic(() => import('./BulkUpload'), { ssr: false });
const ImportReport = dynamic(() => import('./ImportReport'), { ssr: false });

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

const FETCH_SIZE = 25;
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
  const label = String(product.status_name || '').toLowerCase();
  const status = String(product.status || '').toUpperCase();
  if (status === 'ERROR' || /error|ошиб|reject|отклон/i.test(label)) return 'bad';
  if (/improv|улучш|warn|moder|модер/i.test(label)) return 'warn';
  if (status === 'ACTIVE' || /прода|for sale|selling|ready/i.test(label)) return 'ok';
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
  return (
    <img
      className="prod-photo"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}


function ProductStatusCollapsible({ product }) {
  const [open, setOpen] = useState(false);
  const statusName = String(product.status_name || product.status || '—').trim();
  const tone = statusTone(product);

  const isLong = statusName.length > 20 || /cannot be sent|missing/i.test(statusName);

  let shortLabel = statusName;
  if (isLong) {
    if (/cannot be sent/i.test(statusName)) shortLabel = 'Cannot be sent';
    else if (/error/i.test(statusName)) shortLabel = 'Error';
    else if (/reject/i.test(statusName)) shortLabel = 'Rejected';
    else if (/missing/i.test(statusName)) shortLabel = 'Missing data';
    else if (/moder/i.test(statusName)) shortLabel = 'Moderation';
    else shortLabel = statusName.slice(0, 16).trim() + '...';
  }

  if (!isLong) {
    return (
      <span className={`prod-status is-${tone}`} title={statusName}>
        {statusName}
      </span>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`prod-status is-${tone} is-collapsible`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title="Click to view or collapse status details"
        aria-expanded={open}
        style={{
          border: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          fontSize: '11.5px',
          whiteSpace: 'nowrap',
          maxWidth: '160px',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortLabel}
        </span>
        <span style={{ fontSize: '9px', opacity: 0.8, transition: 'transform 0.15s ease', transform: open ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </button>

      {open && (
        <div
          className="prod-status-popover"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            left: 0,
            zIndex: 99,
            width: '260px',
            background: '#FFFFFF',
            border: tone === 'bad' ? '1px solid #FECACA' : '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)',
            fontSize: '12px',
            lineHeight: 1.45,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
            <span style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', color: tone === 'bad' ? '#B91C1C' : '#92400E' }}>
              Status Details
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: '15px',
                padding: '0 4px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: 0, color: '#334155', wordBreak: 'break-word', whiteSpace: 'normal', fontSize: '12px' }}>
            {statusName}
          </p>
        </div>
      )}
    </div>
  );
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
                <a className="dash-primary prod-action-primary" href={`/products/${product.id}/edit`}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  <span>Edit listing</span>
                </a>
                <button type="button" className="dash-outline" onClick={handlePush} disabled={isPushing || isSyncing}>
                  {isPushing ? 'Sending...' : (product.ozon_id ? 'Update on Ozon' : 'Add to Ozon')}
                </button>
                <button
                  type="button"
                  className="dash-outline"
                  onClick={() => onAddVariant && onAddVariant(product)}
                  title="Add another weight or size variant to this product"
                >
                  + Add Variant
                </button>
                <button type="button" className="dash-outline prod-delete-btn" onClick={() => onDelete(product)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Delete</span>
                </button>
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
  const tabCacheRef = useRef(new Map());
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
  const [editingCell, setEditingCell] = useState(null);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [quickFeedback, setQuickFeedback] = useState(null);

  useEffect(() => {
    if (!quickFeedback) return;
    const t = setTimeout(() => setQuickFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [quickFeedback]);

  function startEditing(p, field) {
    setEditingCell({
      id: p.id,
      field,
      value: field === 'price' ? (p.price != null ? String(p.price) : '') : (p.stock != null ? String(p.stock) : '0'),
    });
  }

  async function saveEditing(p) {
    if (!editingCell || isQuickSaving) return;
    setIsQuickSaving(true);
    try {
      const payload = editingCell.field === 'price'
        ? { price: parseFloat(editingCell.value) || 0 }
        : { stock: parseInt(editingCell.value, 10) || 0 };

      const res = await fetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update');

      setFetched((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, ...payload } : item))
      );

      setQuickFeedback({
        message: `✓ Updated ${editingCell.field === 'price' ? 'Price' : 'Stock'} for ${p.sku || p.name}`,
        type: 'success',
      });
      setEditingCell(null);
    } catch (err) {
      setQuickFeedback({ message: `Update failed: ${err.message}`, type: 'error' });
    } finally {
      setIsQuickSaving(false);
    }
  }

  function renderPriceCell(p, isGroup, display) {
    if (isGroup) {
      return <td className="prod-price">{display}</td>;
    }
    const isEditing = editingCell?.id === p.id && editingCell?.field === 'price';
    if (isEditing) {
      return (
        <td className="prod-price" onClick={(e) => e.stopPropagation()}>
          <div className="prod-inline-form">
            <input
              type="number"
              step="0.01"
              autoFocus
              className="prod-inline-input"
              value={editingCell.value}
              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEditing(p);
                if (e.key === 'Escape') setEditingCell(null);
              }}
            />
            <button
              type="button"
              className="prod-inline-btn is-save"
              title="Save (Enter)"
              disabled={isQuickSaving}
              onClick={() => saveEditing(p)}
            >
              ✓
            </button>
            <button
              type="button"
              className="prod-inline-btn is-cancel"
              title="Cancel (Esc)"
              onClick={() => setEditingCell(null)}
            >
              ✕
            </button>
          </div>
        </td>
      );
    }
    return (
      <td className="prod-price">
        <div className="prod-inline-cell">
          <span>{display}</span>
          <button
            type="button"
            className="prod-inline-trigger"
            title="Quick edit price"
            onClick={() => startEditing(p, 'price')}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        </div>
      </td>
    );
  }

  function renderStockCell(p, isGroup, display) {
    if (isGroup) {
      return <td className="prod-warehouse">{display}</td>;
    }
    const isEditing = editingCell?.id === p.id && editingCell?.field === 'stock';
    if (isEditing) {
      return (
        <td className="prod-warehouse" onClick={(e) => e.stopPropagation()}>
          <div className="prod-inline-form">
            <input
              type="number"
              autoFocus
              className="prod-inline-input"
              value={editingCell.value}
              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEditing(p);
                if (e.key === 'Escape') setEditingCell(null);
              }}
            />
            <button
              type="button"
              className="prod-inline-btn is-save"
              title="Save (Enter)"
              disabled={isQuickSaving}
              onClick={() => saveEditing(p)}
            >
              ✓
            </button>
            <button
              type="button"
              className="prod-inline-btn is-cancel"
              title="Cancel (Esc)"
              onClick={() => setEditingCell(null)}
            >
              ✕
            </button>
          </div>
        </td>
      );
    }
    return (
      <td className="prod-warehouse">
        <div className="prod-inline-cell">
          <span>{display}</span>
          <button
            type="button"
            className="prod-inline-trigger"
            title="Quick edit stock"
            onClick={() => startEditing(p, 'stock')}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        </div>
      </td>
    );
  }

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
      if (replace) {
        setCurrentPage(1);
        const cacheKey = `${activeTab}|${filterAccount}|${listFilter}|${search.trim().toLowerCase()}`;
        tabCacheRef.current.set(cacheKey, {
          products: incoming,
          total: counted,
          hasMore: page * FETCH_SIZE < counted && incoming.length > 0,
        });
      }
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
    let cancelled = false;
    fetch(`/api/products/counts?account=${encodeURIComponent(filterAccount)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.counts) {
          setCounts(data.counts);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filterAccount]);

  useEffect(() => {
    const cacheKey = `${activeTab}|${filterAccount}|${listFilter}|${search.trim().toLowerCase()}`;
    const cached = tabCacheRef.current.get(cacheKey);

    // If previously loaded, switch card INSTANTLY (0ms latency, no blanking)
    if (cached) {
      setFetched(cached.products);
      setTotal(cached.total);
      setHasMore(cached.hasMore);
      setCurrentPage(1);
      setLoadingPage(false);
      setLoadError('');
    } else {
      setLoadingPage(true);
    }

    const timer = setTimeout(() => {
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
        <div className="prod-hero-main">
          <h1>Products</h1>
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

      {loadingPage && fetched.length > 0 && (
        <div className="orders-loading-topbar">
          <div className="orders-loading-spinner is-small" />
          <span>Updating products…</span>
        </div>
      )}
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
              <th>Rating</th>
              <th>Content rating</th>
              <th>Creation date</th>
              <th><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {loadingPage && fetched.length === 0 ? (
              <>
                <tr>
                  <td colSpan="10" style={{ padding: 0 }}>
                    <div className="orders-loading-banner">
                      <div className="orders-loading-spinner" />
                      <div>
                        <strong>Loading products…</strong>
                        <span>Fetching products catalog from Ozon</span>
                      </div>
                    </div>
                  </td>
                </tr>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={`prod-skeleton-${i}`} className="orders-skeleton-row">
                    <td><div className="orders-skeleton-box" style={{ width: 16, height: 16, borderRadius: 4 }} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="orders-skeleton-box" style={{ width: 44, height: 44, borderRadius: 6, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div className="orders-skeleton-box" style={{ width: 100, height: 13, borderRadius: 4, marginBottom: 5 }} />
                          <div className="orders-skeleton-box" style={{ width: 70, height: 11, borderRadius: 4 }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="orders-skeleton-box" style={{ width: '85%', height: 14, borderRadius: 4, marginBottom: 5 }} />
                      <div className="orders-skeleton-box" style={{ width: '50%', height: 11, borderRadius: 4 }} />
                    </td>
                    <td><div className="orders-skeleton-box" style={{ width: 75, height: 22, borderRadius: 999 }} /></td>
                    <td><div className="orders-skeleton-box" style={{ width: 65, height: 16, borderRadius: 4 }} /></td>
                    <td><div className="orders-skeleton-box" style={{ width: 70, height: 16, borderRadius: 4 }} /></td>
                    <td><div className="orders-skeleton-box" style={{ width: 45, height: 16, borderRadius: 4 }} /></td>
                    <td><div className="orders-skeleton-box" style={{ width: 55, height: 16, borderRadius: 4 }} /></td>
                    <td><div className="orders-skeleton-box" style={{ width: 75, height: 16, borderRadius: 4 }} /></td>
                    <td><div className="orders-skeleton-box" style={{ width: 22, height: 22, borderRadius: 4 }} /></td>
                  </tr>
                ))}
              </>
            ) : empty ? (
              <tr>
                <td colSpan="10" className="prod-empty">
                  <strong>{empty.title}</strong>
                  <p>{empty.text}</p>
                  {empty.action && <button type="button" className="dash-outline" onClick={empty.onClick}>{empty.action}</button>}
                </td>
              </tr>
            ) : null}
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
                            background: '#E8F5F4',
                            color: '#0C5D58',
                            border: '1px solid #B2E0DC',
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
                      <ProductStatusCollapsible product={main} />
                    </td>
                    {renderPriceCell(main, isVariantGroup, priceDisplay)}
                    {renderStockCell(main, isVariantGroup, stockDisplay)}
                    <td className="prod-num">{!main.rating ? '—' : main.rating}</td>
                    <td className="prod-num">{!main.content_rating ? '—' : main.content_rating}</td>
                    <td className="prod-date">{fmtDate(main.ozon_created_at)}</td>
                    <td className="prod-row-actions">
                      <button type="button" className="prod-open" onClick={() => setSelected(main)}>Open</button>
                      <button
                        type="button"
                        className="dash-ghost"
                        style={{ fontSize: '12px', padding: '2px 6px', color: '#10756F', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer' }}
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
                    <tr key={variant.id} className="prod-variant">
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
                            <span style={{ fontSize: '11px', color: '#5A7572' }}>Variant ID {variant.ozon_id || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="prod-name">
                        <button type="button" title={variant.name || ''} onClick={() => setSelected(variant)}>
                          {variant.name || '—'}
                        </button>
                      </td>
                      <td>
                        <ProductStatusCollapsible product={variant} />
                      </td>
                      {renderPriceCell(variant, false, fmtPrice(variant.price, variant.currency))}
                      {renderStockCell(variant, false, variant.stock == null ? '—' : `${variant.stock} in stock${variant.reserved_stock ? ` · res ${variant.reserved_stock}` : ''}`)}
                      <td className="prod-num">{!variant.rating ? '—' : variant.rating}</td>
                      <td className="prod-num">{!variant.content_rating ? '—' : variant.content_rating}</td>
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
      {quickFeedback && (
        <div className={`prod-quick-feedback is-${quickFeedback.type}`} role="status">
          {quickFeedback.message}
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
