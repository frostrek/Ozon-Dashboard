import Link from 'next/link';
import { listScrapedProducts } from '../../../lib/catalog/scrapedProducts';
import ScrapedBoard from './ScrapedBoard';

export const dynamic = 'force-dynamic';

export default async function ScrapedProductsPage({ searchParams }) {
  const filters = {
    q: String(searchParams?.q || ''),
    brand: String(searchParams?.brand || 'all'),
    status: String(searchParams?.status || 'all'),
    date: String(searchParams?.date || 'all'),
  };
  const data = await listScrapedProducts({ ...filters, page: 1, pageSize: 100 });

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

      <ScrapedBoard
        initialProducts={data.products}
        total={data.total}
        brands={data.brands}
        query={filters.q}
        brand={filters.brand}
        status={filters.status}
        date={filters.date}
      />
    </div>
  );
}
