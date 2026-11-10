'use client';

import { useEffect, useState } from 'react';
import TypeSelect from '../../components/TypeSelect';

export default function ScrapedFilters({ query, brand, status, date, maxWeight = 'all', brands, onChange }) {
  const [text, setText] = useState(query || '');
  const filters = { q: text.trim(), brand, status, date, maxWeight };

  useEffect(() => {
    setText(query || '');
  }, [query]);

  function go(patch) {
    onChange?.({ ...filters, ...patch });
  }

  const isFiltered = Boolean(query || (brand && brand !== 'all') || (status && status !== 'all') || (date && date !== 'all') || (maxWeight && maxWeight !== 'all'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
      {/* Weight Preset Chips (Optimization 3) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>Weight Preset:</span>
        <button
          type="button"
          className={`scraped-chip ${!maxWeight || maxWeight === 'all' ? 'is-active' : ''}`}
          onClick={() => go({ maxWeight: 'all' })}
        >
          All weights
        </button>
        <button
          type="button"
          className={`scraped-chip ${maxWeight === '300' ? 'is-active' : ''}`}
          onClick={() => go({ maxWeight: '300' })}
        >
          ⚡ Under 300g (Courier safe)
        </button>
        <button
          type="button"
          className={`scraped-chip ${maxWeight === '500' ? 'is-active' : ''}`}
          onClick={() => go({ maxWeight: '500' })}
        >
          Under 500g
        </button>
      </div>

      <form className="catalog-filters scraped-filters" onSubmit={(event) => { event.preventDefault(); go({ q: text.trim() }); }}>
        <label className="catalog-search" style={{ margin: 0 }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search name, ASIN, or brand..."
            aria-label="Search scraped products"
          />
        </label>
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button type="submit" className="dash-primary" style={{ height: 42, padding: '0 18px', fontSize: 13, fontWeight: 700, borderRadius: 10 }}>
            Filter
          </button>
          {isFiltered && (
            <button
              type="button"
              className="dash-outline"
              style={{ height: 42, padding: '0 14px', fontSize: 13, fontWeight: 650, borderRadius: 10 }}
              onClick={() => {
                setText('');
                onChange?.({ q: '', brand: 'all', status: 'all', date: 'all', maxWeight: 'all' });
              }}
            >
              Reset
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
