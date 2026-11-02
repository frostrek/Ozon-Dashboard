import { prisma } from '../../lib/prisma';
import { recoverStaleRuns } from '../../lib/pipeline/recoverRuns';
import PipelineClient from './PipelineClient';
import FriendlyError from '../components/FriendlyError';
import { toPlain } from '../../lib/toPlain';

export const dynamic = 'force-dynamic';

export default async function PipelinePage({ searchParams }) {
  await recoverStaleRuns();
  const accounts = await prisma.account.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const safeAccounts = toPlain(accounts) || [];
  if (!safeAccounts.length) {
    return <FriendlyError kind="no-account" />;
  }
  const requested = searchParams?.accountId || '';
  const initialAccountId = safeAccounts.some((account) => account.id === requested)
    ? requested
    : (safeAccounts[0]?.id || '');

  return <PipelineClient accounts={safeAccounts} initialAccountId={initialAccountId} />;
}
