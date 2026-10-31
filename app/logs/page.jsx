import { prisma } from '../../lib/prisma';
import ListPager from '../components/ListPager';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 8;

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

export default async function LogsPage({ searchParams }) {
  const requested = Math.max(1, Number(searchParams?.page) || 1);
  let runs = [];
  let total = 0;
  let loadError = '';
  try {
    total = await prisma.pipelineRun.count();
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requested, pageCount);
    runs = total
      ? await prisma.pipelineRun.findMany({
        include: { account: { select: { name: true } } },
        orderBy: { start_time: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      })
      : [];
    const start = total === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    return (
      <div>
        <header className="page-head">
          <h1>Logs</h1>
          <p className="page-lead">Saved logs from pipeline runs.</p>
        </header>
        {runs.length === 0 ? (
          <section className="catalog-empty">
            <h2>No logs yet</h2>
            <p>Start a pipeline run and its log will show up here.</p>
          </section>
        ) : (
          <div className="stack">
            {runs.map((run) => (
              <section key={run.id} className="stat-card">
                <h2 className="section-title">{run.account?.name || 'Unknown account'}</h2>
                <p className="page-lead">{when(run.start_time)} · {run.cancelled ? 'Cancelled' : (run.status || 'Saved')}</p>
                <pre className="pipe-error-full">{run.log_excerpt || run.error_message || 'No log was saved for this run.'}</pre>
              </section>
            ))}
            <ListPager
              label="Log pages"
              page={page}
              pageCount={pageCount}
              start={start}
              end={end}
              total={total}
              noun="runs"
              hrefBase="/logs"
            />
          </div>
        )}
      </div>
    );
  } catch (error) {
    loadError = error?.message || 'Logs could not be loaded.';
  }

  return (
    <div>
      <header className="page-head">
        <h1>Logs</h1>
        <p className="page-lead">Saved logs from pipeline runs.</p>
      </header>
      <p className="notice notice-error" role="alert">{loadError}</p>
    </div>
  );
}
