'use client';

import { FETCH_SIZE, useBatchScroll } from '../../hooks/useBatchScroll';

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
  const scroll = useBatchScroll({
    initialItems: initialProducts,
    initialTotal: total,
    resetKey: `${query}|${brand}|${status}|${date}`,
    itemKey: 'asin',
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

  return (
    <>
      {scroll.loading ? <p className="page-lead">Loading the next 100 products…</p> : null}
      {scroll.error ? (
        <p className="notice notice-error" role="alert">
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>Retry</button>
        </p>
      ) : null}
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
            </tr>
          </thead>
          <tbody>
            {scroll.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="catalog-empty-cell">No scraped products match these filters.</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scroll.items.length > 0 ? <div ref={scroll.sentinelRef} aria-hidden="true" /> : null}
      {scroll.reachedEnd ? <p className="page-lead">All scraped products in this view are loaded.</p> : null}
    </>
  );
}
