import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { listRunFiles, serializeRun } from '../../../../../lib/pipeline/files';
import { recoverStaleRuns } from '../../../../../lib/pipeline/recoverRuns';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  await recoverStaleRuns();
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    include: { account: true },
  });
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  return NextResponse.json(serializeRun(run, await listRunFiles(run.run_dir)));
}
