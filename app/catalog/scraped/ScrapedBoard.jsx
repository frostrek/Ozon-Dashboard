'use client';

import { useEffect, useState } from 'react';
import { replaceQuery } from '../../lib/replaceQuery';
import ScrapedFilters from './ScrapedFilters';
import ScrapedList from './ScrapedList';

export default function ScrapedBoard({ initialProducts, total, brands, query, brand, status, date }) {
  const [filters, setFilters] = useState({
    q: query || '',
    brand: brand || 'all',
    status: status || 'all',
    date: date || 'all',
  });

  useEffect(() => {
    replaceQuery('/catalog/scraped', {
      q: filters.q,
      brand: filters.brand === 'all' ? '' : filters.brand,
      status: filters.status === 'all' ? '' : filters.status,
      date: filters.date === 'all' ? '' : filters.date,
    });
  }, [filters]);

  return (
    <>
      <ScrapedFilters
        query={filters.q}
        brand={filters.brand}
        status={filters.status}
        date={filters.date}
        brands={brands}
        onChange={setFilters}
      />
      <ScrapedList
        initialProducts={initialProducts}
        total={total}
        query={filters.q}
        brand={filters.brand}
        status={filters.status}
        date={filters.date}
      />
    </>
  );
}
