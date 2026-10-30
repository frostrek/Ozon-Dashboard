import Link from 'next/link';
import { prisma } from '../../../../lib/prisma';
import { listCatalogRuns, readCatalogStatus } from '../../../../lib/catalog/listRuns';
import RunLive from './RunLive';

export const dynamic = 'force-dynamic';

export default async function CatalogRunPage({ params }) {
  const [run, accounts, runs] = await Promise.all([
    readCatalogStatus(params.id).catch(() => null),
    prisma.account.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listCatalogRuns().catch(() => []),
  ]);

  if (!run) {
    return (
      <div>
        <header className="page-head">
          <h1>Catalog run</h1>
          <p className="page-lead">This run is not on the server. Job files stay on the machine that started them, and Render removes them when the service restarts.</p>
        </header>
        <Link className="dash-primary" href="/catalog">Back to catalog</Link>
      </div>
    );
  }

  const other = runs.find((item) => item.runId !== run.runId && (item.status === 'pending' || item.status === 'running'));

  return (
    <RunLive
      initial={run}
      accounts={accounts}
      otherActive={other ? { runId: other.runId, title: other.keyword || other.asin || 'Catalog run' } : null}
    />
  );
}
