import { prisma } from '../../lib/prisma';
import { recoverStaleRuns } from '../../lib/pipeline/recoverRuns';
import PipelineClient from './PipelineClient';

export const dynamic = 'force-dynamic';

export default async function PipelinePage({ searchParams }) {
  await recoverStaleRuns();
  const accounts = await prisma.account.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const requested = searchParams?.accountId || '';
  const initialAccountId = accounts.some((account) => account.id === requested)
    ? requested
    : (accounts[0]?.id || '');

  return <PipelineClient accounts={accounts} initialAccountId={initialAccountId} />;
}
