'use client';

import { useEffect, useState } from 'react';
import TypeSelect from '../../components/TypeSelect';

export default function ScrapedFilters({ query, brand, status, date, brands, onChange }) {
  const [text, setText] = useState(query || '');
  const filters = { q: text.trim(), brand, status, date };

  useEffect(() => {
    setText(query || '');
  }, [query]);

  function go(patch) {
    onChange?.({ ...filters, ...patch });
  }

  return (
    <form className="catalog-filters scraped-filters" onSubmit={(event) => { event.preventDefault(); go({ q: text.trim() }); }}>
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Search name, ASIN, or brand" aria-label="Search scraped products" />
      <TypeSelect
        label="Brand"
        value={brand || 'all'}
        options={[{ id: 'all', label: 'All brands' }, ...brands.map((item) => ({ id: item, label: item }))]}
        onChange={(next) => go({ brand: next })}
      />
      <TypeSelect
        label="Status"
        value={status || 'all'}
        options={[
          { id: 'all', label: 'All statuses' },
          { id: 'enriched', label: 'Ready' },
          { id: 'blocked_weight', label: 'Held by weight' },
        ]}
        onChange={(next) => go({ status: next })}
      />
      <TypeSelect
        label="Date"
        value={date || 'all'}
        options={[
          { id: 'all', label: 'All dates' },
          { id: 'today', label: 'Today' },
          { id: 'yesterday', label: 'Yesterday' },
          { id: 'week', label: 'Last 7 days' },
          { id: 'month', label: 'Last 30 days' },
        ]}
        onChange={(next) => go({ date: next })}
      />
      <button type="submit" className="dash-primary">Apply</button>
      <button type="button" className="dash-outline" onClick={() => { setText(''); onChange?.({ q: '', brand: 'all', status: 'all', date: 'all' }); }}>Clear</button>
    </form>
  );
}
