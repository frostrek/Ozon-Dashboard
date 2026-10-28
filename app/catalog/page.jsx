import { listCatalogRuns } from '../../lib/catalog/listRuns';
import CatalogBoard from './CatalogBoard';

export const dynamic = 'force-dynamic';

function runTitle(run) {
  return run.keyword || (run.mode === 'single' ? run.asin || 'Single product' : 'Untitled run');
}

export default async function CatalogPage() {
  let runs = [];
  let loadError = '';
  try {
    runs = await listCatalogRuns();
  } catch (error) {
    loadError = error?.message || 'Catalog runs could not be loaded.';
  }

  const rows = runs.map((run) => ({
    runId: run.runId,
    title: runTitle(run),
    asin: run.asin || '',
    accountName: run.accountName || 'Unknown account',
    status: run.status || 'pending',
    scraped: run.progress?.scraped ?? 0,
    pushed: run.progress?.pushed ?? 0,
    failed: run.progress?.failed ?? 0,
    startedAt: run.startedAt || '',
  }));
  const activeRun = runs.find((run) => run.status === 'pending' || run.status === 'running');
  const active = activeRun ? { runId: activeRun.runId, title: runTitle(activeRun), accountName: activeRun.accountName } : null;

  return (
    <div className="catalog-page">
      {loadError ? <p className="catalog-alert" role="alert">{loadError}</p> : null}
      <CatalogBoard runs={rows} active={active} />
    </div>
  );
}
