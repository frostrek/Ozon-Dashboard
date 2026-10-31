'use client';

import ListPager from '../components/ListPager';
import { FETCH_SIZE, UI_BATCH, useBatchScroll } from '../hooks/useBatchScroll';

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LogsClient({ initialRuns, total }) {
  const scroll = useBatchScroll({
    initialItems: initialRuns,
    initialTotal: total,
    resetKey: 'logs',
    itemKey: 'id',
    pageMode: true,
    loadPage: async (page) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(FETCH_SIZE) });
      const response = await fetch(`/api/logs?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Logs could not be loaded.');
      return { items: data.runs || [], total: Number(data.total) || 0 };
    },
  });

  if (scroll.total === 0 && scroll.items.length === 0 && !scroll.loading) {
    return (
      <section className="catalog-empty">
        <h2>No logs yet</h2>
        <p>Start a pipeline run and its log will show up here.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      {scroll.loading ? <p className="page-lead">Loading logs…</p> : null}
      {scroll.error ? (
        <p className="notice notice-error" role="alert">
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>Retry</button>
        </p>
      ) : null}
      {scroll.items.map((run) => (
        <section key={run.id} className="stat-card">
          <h2 className="section-title">{run.accountName}</h2>
          <p className="page-lead">{when(run.startTime)} · {run.cancelled ? 'Cancelled' : (run.status || 'Saved')}</p>
          <pre className="pipe-error-full">{run.logExcerpt || 'No log was saved for this run.'}</pre>
        </section>
      ))}
      {scroll.total > 0 ? (
        <ListPager
          label="Log pages"
          page={scroll.currentPage}
          pageCount={scroll.pageCount}
          start={scroll.rangeStart}
          end={scroll.rangeEnd}
          total={scroll.total}
          pageSize={UI_BATCH}
          noun="runs"
          onPage={scroll.goToPage}
        />
      ) : null}
    </div>
  );
}
