'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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

const PAGE_SIZE = 10;

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

function listedAt(product) {
  const updated = Date.parse(product.updated_at || '') || 0;
  const created = Date.parse(product.created_at || '') || 0;
  return Math.max(updated, created);
}

function isJustListed(product) {
  const statusName = String(product.status_name || '');
  return product.status === 'PENDING'
    || String(product.ozon_id || '').startsWith('local-')
    || /import sent|not sent/i.test(statusName);
}

function matchesTab(product, tab) {
  const stock = Number(product.stock);
  if (tab === 'READY_FOR_SALE') return product.status === 'ACTIVE' && stock > 0;
  if (tab === 'ERROR') return product.status === 'ERROR';
  if (tab === 'FOR_IMPROVEMENT') return typeof product.content_rating === 'number' && product.content_rating < 50;
  if (tab === 'INACTIVE') return product.status === 'ACTIVE' && stock === 0;
  if (tab === 'ARCHIVE') return product.status === 'ARCHIVED';
  if (tab === 'LOW_STOCK') return stock < 5 && product.status !== 'ARCHIVED';
  if (tab === 'OUT_OF_STOCK') return stock === 0 && product.status !== 'ARCHIVED';
  return true;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '') ?? fallback;
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
  return date.toLocaleDateString('en-IN');
}

function ProductImage({ product }) {
  const src = firstImage(product);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="prod-photo prod-photo-empty">No image</span>;
  return <img className="prod-photo" src={src} alt="" onError={() => setFailed(true)} />;
}

function DetailDrawer({ product, onClose, onDelete }) {
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

export default function ProductsClient({ initialProducts, accounts = [] }) {
  const products = initialProducts || [];
  const [activeTab, setActiveTab] = useState('ALL');
  const [filterAccount, setFilterAccount] = useState('all');
  const [listFilter, setListFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [selection, setSelection] = useState([]);
  const [showVariants, setShowVariants] = useState({});
  const [page, setPage] = useState(1);
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

  const accountProducts = useMemo(
    () => products.filter((product) => filterAccount === 'all' || product.account_id === filterAccount),
    [products, filterAccount],
  );

  const counts = useMemo(() => {
    const tally = {};
    TABS.forEach((tab) => {
      tally[tab.id] = accountProducts.filter((product) => matchesTab(product, tab.id)).length;
    });
    return tally;
  }, [accountProducts]);

  const filteredProducts = useMemo(() => {
    const matched = accountProducts.filter((product) => {
      if (!matchesTab(product, activeTab)) return false;
      if (listFilter === 'listed' && !isJustListed(product)) return false;
      if (listFilter === 'selling' && !(product.status === 'ACTIVE' || product.status_name === 'Продается')) return false;
      if (listFilter === 'out' && !(Number(product.stock) === 0 && product.status !== 'ARCHIVED')) return false;
      if (listFilter === 'error' && product.status !== 'ERROR') return false;
      if (!search.trim()) return true;
      const needle = search.toLowerCase();
      const barcode = barcodeOf(product) || '';
      return [product.name, product.sku, product.ozon_id, product.brand, barcode]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
    return matched.sort((left, right) => listedAt(right) - listedAt(left));
  }, [accountProducts, activeTab, search, listFilter]);

  React.useEffect(() => {
    setPage(1);
  }, [activeTab, filterAccount, search, listFilter]);

  const variantGroups = useMemo(() => {
    const groups = {};
    filteredProducts.forEach((product) => {
      const key = product.variant_group_id || `none_${product.id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });
    return groups;
  }, [filteredProducts]);

  const groupEntries = Object.entries(variantGroups);
  const pageCount = Math.max(1, Math.ceil(groupEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rangeStart = groupEntries.length === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, groupEntries.length);
  const pageGroups = groupEntries.slice(rangeStart === 0 ? 0 : rangeStart - 1, rangeEnd);
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
  if (products.length === 0) {
    empty = {
      title: 'No products yet',
      text: 'No products are stored for the connected accounts.',
    };
  } else if (groupEntries.length === 0 && search.trim()) {
    empty = {
      title: 'No matching products',
      text: 'Nothing matches this search.',
      action: 'Clear search',
      onClick: () => setSearch(''),
    };
  } else if (groupEntries.length === 0) {
    empty = {
      title: 'No products in this view',
      text: 'The selected account or status has no matching products.',
      action: 'Clear filters',
      onClick: clearFilters,
    };
  }

  return (
    <div className="prod-page">
      <header className="prod-head">
        <div>
          <h1>Products</h1>
          <p className="page-lead">Review stored Ozon products, then open a row for stock, images, and the listing editor.</p>
          <p className="prod-count">{products.length} {products.length === 1 ? 'product' : 'products'}</p>
        </div>
        <div className="prod-head-actions">
          <button type="button" className="dash-outline" onClick={syncFromOzon} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync from Ozon'}
          </button>
          <a className="dash-outline" href="/api/products/import/template">Download template</a>
          <button type="button" className="dash-outline" onClick={() => { setNotice(''); setUploading(true); }}>Upload spreadsheet</button>
          <button type="button" className="dash-primary" onClick={() => { setNotice(''); setAdding(true); }}>Add products</button>
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

      <div className="prod-tabs" role="tablist" aria-label="Product status">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'prod-tab is-on' : 'prod-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span>{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="prod-toolbar">
        <label className="prod-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, article code, SKU, barcode"
            aria-label="Search products"
          />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search">Clear</button>}
        </label>
        <select value={filterAccount} onChange={(event) => setFilterAccount(event.target.value)} aria-label="Account">
          <option value="all">All accounts</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <select value={listFilter} onChange={(event) => setListFilter(event.target.value)} aria-label="Filter products">
          <option value="all">All products</option>
          <option value="listed">Just listed</option>
          <option value="selling">On sale</option>
          <option value="out">Out of stock</option>
          <option value="error">Errors</option>
        </select>
        {(filtersActive || search) && (
          <button type="button" className="dash-outline prod-clear" onClick={clearFilters}>Clear filters</button>
        )}
        {selection.length > 0 && <span className="prod-selected">{selection.length} selected</span>}
        {selection.length > 0 && (
          <button type="button" className="dash-primary" onClick={() => sendProducts(selection)} disabled={importing}>
            {importing ? 'Sending...' : 'Add to Ozon'}
          </button>
        )}
      </div>

      <div className="table-wrap prod-table-wrap">
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
              <th>Image / SKU</th>
              <th>Product name</th>
              <th>Status</th>
              <th>Your price</th>
              <th>In warehouses</th>
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
              return (
                <React.Fragment key={groupId}>
                  <tr>
                    <td>
                      <input type="checkbox" aria-label={`Select ${main.name}`} checked={selection.includes(main.id)} onChange={() => toggleSelect(main.id)} />
                    </td>
                    <td>
                      <div className="prod-sku">
                        <ProductImage product={main} />
                        <div>
                          <strong>{main.sku || '—'}</strong>
                          <span>ID {main.ozon_id || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="prod-name">
                      <button type="button" onClick={() => setSelected(main)}>{main.name || '—'}</button>
                      {isVariantGroup && (
                        <button type="button" className="prod-variants" onClick={() => setShowVariants({ ...showVariants, [groupId]: !isOpen })}>
                          {isOpen ? 'Hide variants' : `Variants (${group.length})`}
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={main.status === 'ACTIVE' ? 'pipe-badge pipe-badge-ok' : main.status === 'ERROR' ? 'pipe-badge pipe-badge-bad' : 'pipe-badge pipe-badge-muted'}>
                        {main.status_name || main.status || '—'}
                      </span>
                    </td>
                    <td>{fmtPrice(main.price, main.currency)}</td>
                    <td>{main.stock == null ? '—' : main.stock}{main.reserved_stock == null ? '' : ` · reserved ${main.reserved_stock}`}</td>
                    <td className="prod-barcode">{barcode || '—'}</td>
                    <td>{main.rating == null ? '—' : main.rating}</td>
                    <td>{main.content_rating == null ? '—' : main.content_rating}</td>
                    <td>{fmtDate(main.ozon_created_at)}</td>
                    <td className="prod-row-actions">
                      <button type="button" className="prod-open" onClick={() => setSelected(main)}>Open</button>
                      <button type="button" className="prod-delete" onClick={() => { setRemoveError(''); setRemoveTarget(main); }}>Delete</button>
                    </td>
                  </tr>
                  {isOpen && group.slice(1).map((variant) => (
                    <tr key={variant.id} className="prod-variant">
                      <td>
                        <input type="checkbox" aria-label={`Select ${variant.name}`} checked={selection.includes(variant.id)} onChange={() => toggleSelect(variant.id)} />
                      </td>
                      <td>
                        <div className="prod-sku">
                          <ProductImage product={variant} />
                          <strong>{variant.sku || '—'}</strong>
                        </div>
                      </td>
                      <td className="prod-name">{variant.name || '—'}</td>
                      <td colSpan="8">
                        {fmtPrice(variant.price, variant.currency)} · {variant.stock == null ? '—' : `${variant.stock} in stock`} · {variant.status_name || variant.status || '—'}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {groupEntries.length > 0 && (
        <nav className="pipe-pager" aria-label="Product pages">
          <span>Showing {rangeStart}–{rangeEnd} of {groupEntries.length}</span>
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
              ) : <span key={item} className="prod-page-gap">…</span>
            ))}
            <button type="button" className="pipe-page-btn" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount}>
              Next
            </button>
          </div>
        </nav>
      )}

      <DetailDrawer product={selected} onClose={() => setSelected(null)} onDelete={(product) => { setRemoveError(''); setRemoveTarget(product); }} />
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
      {adding && <AddProductForm accounts={accounts} onClose={() => setAdding(false)} />}
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
