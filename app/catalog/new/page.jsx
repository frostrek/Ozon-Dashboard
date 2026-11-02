import { prisma } from '../../../lib/prisma';
import { listCatalogRuns } from '../../../lib/catalog/listRuns';
import NewRunForm from './NewRunForm';
import FriendlyError from '../../components/FriendlyError';
import { toPlain } from '../../../lib/toPlain';

export const dynamic = 'force-dynamic';

export default async function NewCatalogRunPage() {
  const [accounts, runs] = await Promise.all([
    prisma.account.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    listCatalogRuns(),
  ]);
  const active = runs.find((run) => run.status === 'pending' || run.status === 'running');

  return (
    <div>
      <header className="page-head">
        <h1>New catalog run</h1>
        <p className="page-lead">
          Fill in the run one step at a time. Scraping and the Ozon push stay in the job runner.
        </p>
      </header>
      {accounts.length === 0 ? (
        <FriendlyError kind="no-account" />
      ) : (
        <NewRunForm
          accounts={toPlain(accounts) || []}
          activeRun={active ? {
            runId: active.runId,
            accountId: active.accountId,
            accountName: active.accountName,
            title: active.keyword || active.asin || 'Catalog run',
          } : null}
        />
      )}
    </div>
  );
}
