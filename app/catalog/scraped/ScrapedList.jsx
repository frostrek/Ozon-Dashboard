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
}) {
  const [deleting, setDeleting] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const scroll = useBatchScroll({
    initialItems: initialProducts,
    initialTotal: total,
    resetKey: `${query}|${brand}|${status}|${date}`,
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
      });
      const response = await fetch(`/api/catalog/scraped?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Scraped products could not be loaded.');
      return { items: data.products || [], total: Number(data.total) || 0 };
    },
  });

  async function deleteProduct(product) {
    const asin = product?.asin;
    if (!asin || deleting) return;
    if (!window.confirm(`Delete “${product.name || asin}” from scraped products? This cannot be undone.`)) return;
    setDeleting(asin);
    setDeleteError('');
    try {
      const response = await fetch(`/api/catalog/scraped?asin=${encodeURIComponent(asin)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The scraped product could not be deleted.');
      scroll.removeByKey(asin);
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleting('');
    }
  }

  return (
    <>
      {scroll.loading ? <p className="page-lead">Loading the next 100 products…</p> : null}
      {scroll.error ? (
        <p className="notice notice-error" role="alert">
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>Retry</button>
        </p>
      ) : null}
      {deleteError ? <p className="notice notice-error" role="alert">{deleteError}</p> : null}
      <div className="table-wrap catalog-table-wrap" ref={scroll.tableWrapRef}>
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Product</th>
              <th>ASIN</th>
              <th>Brand</th>
              <th>Weight</th>
              <th>Price</th>
              <th>Status</th>
              <th>Scraped</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scroll.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="catalog-empty-cell">No scraped products match these filters.</td>
              </tr>
            ) : scroll.items.map((product) => (
              <tr key={product.asin}>
                <td>
                  {product.imageUrl
                    ? <img src={product.imageUrl} alt="" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                    : <span className="catalog-thumb-empty">—</span>}
                </td>
                <td>
                  {product.amazonUrl
                    ? <a className="catalog-keyword" href={product.amazonUrl} target="_blank" rel="noreferrer">{product.name || product.asin}</a>
                    : (product.name || product.asin)}
                </td>
                <td>{product.asin}</td>
                <td>{product.brand || '—'}</td>
                <td>{Number(product.weightGrams) > 0 ? `${product.weightGrams} g` : '—'}</td>
                <td>{money(product.priceInr)}</td>
                <td>{product.status === 'blocked_weight' ? 'Held by weight' : 'Ready'}</td>
                <td className="catalog-when">{when(product.scrapedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="dash-outline catalog-delete"
                    disabled={deleting === product.asin}
                    onClick={() => deleteProduct(product)}
                  >
                    {deleting === product.asin ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
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
