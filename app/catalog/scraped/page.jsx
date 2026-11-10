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
    maxWeight: String(searchParams?.maxWeight || 'all'),
  };
  const data = await listScrapedProducts({ ...filters, page: 1, pageSize: 100 });

  return (
    <div className="catalog-page">
      <header className="catalog-hero">
        <div>
          <h1>Product Scraping</h1>
        </div>
        <Link className="dash-primary catalog-new" href="/catalog/new">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>New run</span>
        </Link>
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
        maxWeight={filters.maxWeight}
      />
    </div>
  );
}
