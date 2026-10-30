import Link from 'next/link';
import { listScrapedProducts } from '../../../lib/catalog/scrapedProducts';
import ListPager from '../../components/ListPager';
import ScrapedFilters from './ScrapedFilters';

export const dynamic = 'force-dynamic';

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

export default async function ScrapedProductsPage({ searchParams }) {
  const filters = {
    q: String(searchParams?.q || ''),
    brand: String(searchParams?.brand || 'all'),
    status: String(searchParams?.status || 'all'),
    date: String(searchParams?.date || 'all'),
    page: String(searchParams?.page || '1'),
    pageSize: String(searchParams?.pageSize || '20'),
  };
  const data = await listScrapedProducts(filters);
  const start = data.total === 0 ? 0 : ((data.page - 1) * data.pageSize) + 1;
  const end = Math.min(data.page * data.pageSize, data.total);

  return (
    <div className="catalog-page">
      <header className="catalog-hero">
        <div>
          <h1>Catalog</h1>
          <p>Every product saved from a catalog scrape. The newest scrape is first.</p>
        </div>
        <Link className="dash-primary catalog-new" href="/catalog/new">New run</Link>
      </header>
      <nav className="catalog-tabs" aria-label="Catalog sections">
        <Link href="/catalog">Runs</Link>
        <Link href="/catalog/scraped" className="is-on">Scraped products</Link>
      </nav>

      <ScrapedFilters query={filters.q} brand={filters.brand} status={filters.status} date={filters.date} brands={data.brands} />

      <div className="table-wrap catalog-table-wrap">
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
            {data.products.length === 0 ? (
              <tr>
                <td colSpan={8} className="catalog-empty-cell">No scraped products match these filters.</td>
              </tr>
            ) : data.products.map((product) => (
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

      <ListPager
        label="Scraped product pages"
        page={data.page}
        pageCount={data.pageCount}
        start={start}
        end={end}
        total={data.total}
        noun="products"
        hrefBase="/catalog/scraped"
        hrefQuery={filters}
        defaultPageSize="20"
        pageSize={data.pageSize}
        pageSizes={[10, 20, 50]}
      />
    </div>
  );
}
