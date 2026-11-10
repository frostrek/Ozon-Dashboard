'use client';

import { useState } from 'react';
import ListPager from '../../components/ListPager';
import { FETCH_SIZE, UI_BATCH, useBatchScroll } from '../../hooks/useBatchScroll';

function money(value) {
  const amount = Number(value);
  if (!(amount > 0)) return '—';
  return `₹ ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ScrapedList({
  initialProducts,
  total,
  query = '',
  brand = 'all',
  status = 'all',
  date = 'all',
  maxWeight = 'all',
}) {
  const [deleting, setDeleting] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [copiedAsin, setCopiedAsin] = useState('');
  const [selectedAsins, setSelectedAsins] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Optimization 1: One-Click Import to Products
  const [importingAsin, setImportingAsin] = useState('');
  const [importedMap, setImportedMap] = useState({});
  const [importNotice, setImportNotice] = useState(null);

  const scroll = useBatchScroll({
    initialItems: initialProducts,
    initialTotal: total,
    resetKey: `${query}|${brand}|${status}|${date}|${maxWeight}`,
    itemKey: 'asin',
    pageMode: true,
    loadPage: async (page) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(FETCH_SIZE),
        q: query,
        brand,
        status,
        date,
        maxWeight,
      });
      const response = await fetch(`/api/catalog/scraped?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Scraped products could not be loaded.');
      return { items: data.products || [], total: Number(data.total) || 0 };
    },
  });

  function copyAsin(asin) {
    if (!asin) return;
    navigator.clipboard?.writeText(asin).then(() => {
      setCopiedAsin(asin);
      setTimeout(() => setCopiedAsin(''), 2000);
    });
  }

  async function handleImport(product) {
    if (importingAsin || importedMap[product.asin]) return;
    setImportingAsin(product.asin);
    setImportNotice(null);
    try {
      const res = await fetch('/api/catalog/scraped/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asin: product.asin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to import product');

      setImportedMap((prev) => ({ ...prev, [product.asin]: data.productId }));
      setImportNotice({
        message: `✓ Imported "${(product.name || product.asin).slice(0, 32)}..." into Products catalog!`,
        type: 'success',
      });
      setTimeout(() => setImportNotice(null), 5000);
    } catch (err) {
      setImportNotice({ message: `Import failed: ${err.message}`, type: 'error' });
    } finally {
      setImportingAsin('');
    }
  }

  async function deleteProduct(product) {
    const asin = product?.asin;
    if (!asin || deleting) return;
    if (!window.confirm(`Delete “${product.name || asin}”? This cannot be undone.`)) return;
    setDeleting(asin);
    setDeleteError('');
    try {
      const response = await fetch(`/api/catalog/scraped?asin=${encodeURIComponent(asin)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The scraped product could not be deleted.');
      scroll.removeByKey(asin);
      setSelectedAsins((prev) => prev.filter((id) => id !== asin));
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleting('');
    }
  }

  async function handleBulkDelete() {
    if (!selectedAsins.length || bulkDeleting) return;
    if (!window.confirm(`Delete all ${selectedAsins.length} selected products? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      for (const asin of selectedAsins) {
        await fetch(`/api/catalog/scraped?asin=${encodeURIComponent(asin)}`, { method: 'DELETE' });
        scroll.removeByKey(asin);
      }
      setSelectedAsins([]);
    } catch (err) {
      setDeleteError('Some items could not be deleted.');
    } finally {
      setBulkDeleting(false);
    }
  }

  const allSelected = scroll.items.length > 0 && scroll.items.every((p) => selectedAsins.includes(p.asin));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedAsins([]);
    } else {
      setSelectedAsins(scroll.items.map((p) => p.asin));
    }
  }

  function toggleSelect(asin) {
    setSelectedAsins((prev) =>
      prev.includes(asin) ? prev.filter((id) => id !== asin) : [...prev, asin]
    );
  }

  return (
    <>
      {scroll.loading ? <p className="page-lead">Loading products…</p> : null}
      {scroll.error ? (
        <p className="notice notice-error" role="alert">
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>Retry</button>
        </p>
      ) : null}
      {deleteError ? <p className="notice notice-error" role="alert">{deleteError}</p> : null}

      {importNotice && (
        <div className={`prod-quick-feedback is-${importNotice.type}`} role="status">
          {importNotice.message}
        </div>
      )}

      {/* Floating / Inline Bulk Action Bar */}
      {selectedAsins.length > 0 && (
        <div className="scraped-bulk-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span><strong>{selectedAsins.length}</strong> products selected</span>
            <button
              type="button"
              onClick={() => setSelectedAsins([])}
              style={{ background: 'transparent', border: 'none', color: '#B2E0DC', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Deselect all
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="dash-primary"
              style={{ background: '#DC2626', borderColor: '#DC2626', height: 32, fontSize: 12, padding: '0 12px' }}
              disabled={bulkDeleting}
              onClick={handleBulkDelete}
            >
              {bulkDeleting ? 'Deleting...' : `Delete (${selectedAsins.length})`}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap catalog-table-wrap" ref={scroll.tableWrapRef}>
        <table className="catalog-table">
          <thead>
            <tr>
              <th style={{ width: 40, paddingRight: 0 }}>
                <input
                  type="checkbox"
                  aria-label="Select all scraped products"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Image</th>
              <th>Product</th>
              <th>ASIN</th>
              <th>Brand</th>
              <th>Weight</th>
              <th>Price & Margin</th>
              <th>Status</th>
              <th>Scraped</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scroll.items.length === 0 ? (
              <tr>
                <td colSpan={10} className="catalog-empty-cell">No scraped products match these filters.</td>
              </tr>
            ) : scroll.items.map((product) => {
              const isSelected = selectedAsins.includes(product.asin);
              const isHeavy = product.status === 'blocked_weight';
              const inrPrice = Number(product.priceInr) || 0;
              const estUsd = inrPrice > 0 ? ((inrPrice * 1.8) / 87).toFixed(2) : null;

              return (
                <tr key={product.asin} className={isSelected ? 'is-selected' : ''}>
                  <td style={{ width: 40, paddingRight: 0 }}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${product.name || product.asin}`}
                      checked={isSelected}
                      onChange={() => toggleSelect(product.asin)}
                    />
                  </td>
                  <td>
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="scraped-thumb-img"
                      />
                    ) : (
                      <span className="catalog-thumb-empty">—</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 650,
                          color: '#0F172A',
                          lineHeight: 1.35,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                        title={product.name}
                      >
                        {product.name || product.asin}
                      </span>
                      {product.amazonUrl && (
                        <a
                          className="catalog-keyword"
                          href={product.amazonUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                        >
                          <span>Open on Amazon</span>
                          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="scraped-asin-pill">
                      <span>{product.asin}</span>
                      <button
                        type="button"
                        className="scraped-copy-btn"
                        title="Copy ASIN"
                        onClick={() => copyAsin(product.asin)}
                      >
                        {copiedAsin === product.asin ? (
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#10756F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                      {product.brand || '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex',
                      padding: '2px 7px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 650,
                      background: isHeavy ? '#FEF3C7' : '#F1F5F9',
                      color: isHeavy ? '#92400E' : '#475569',
                    }}>
                      {Number(product.weightGrams) > 0 ? `${product.weightGrams} g` : '—'}
                    </span>
                  </td>

                  {/* Optimization 2: Automated Price & Margin Calculator */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ fontSize: 13, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                        {money(product.priceInr)}
                      </strong>
                      {estUsd && (
                        <span style={{ fontSize: 11, color: '#10756F', fontWeight: 650, marginTop: 1 }}>
                          ~$${estUsd} USD est.
                        </span>
                      )}
                    </div>
                  </td>

                  <td>
                    {isHeavy ? (
                      <span className="catalog-status is-bad" title="Exceeds maximum courier weight limit">
                        Held by weight
                      </span>
                    ) : (
                      <span className="catalog-status is-ok">
                        Ready
                      </span>
                    )}
                  </td>
                  <td className="catalog-when">{when(product.scrapedAt)}</td>

                  {/* Optimization 1: One-Click Import to Products */}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {importedMap[product.asin] ? (
                        <a
                          href={`/products/${importedMap[product.asin]}/edit`}
                          className="scraped-in-catalog-link"
                          title="Open in Products editor"
                        >
                          ✓ In Catalog (Edit)
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="dash-primary scraped-import-btn"
                          disabled={importingAsin === product.asin}
                          onClick={() => handleImport(product)}
                          title="Import to Product Catalog as Draft"
                        >
                          {importingAsin === product.asin ? 'Importing...' : '+ To Catalog'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="scraped-del-btn"
                        disabled={deleting === product.asin}
                        onClick={() => deleteProduct(product)}
                        title="Delete scraped item"
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {scroll.total > 0 ? (
        <ListPager
          label="Scraped product pages"
          page={scroll.currentPage}
          pageCount={scroll.pageCount}
          start={scroll.rangeStart}
          end={scroll.rangeEnd}
          total={scroll.total}
          pageSize={UI_BATCH}
          noun="products"
          onPage={scroll.goToPage}
        />
      ) : null}
    </>
  );
}
