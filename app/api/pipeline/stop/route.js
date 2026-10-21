import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { killProcessTree } from '../../../../lib/pipeline/killTree';
import { markCancelling } from '../../../../lib/pipeline/cancelGuard';
import { recoverStaleRuns } from '../../../../lib/pipeline/recoverRuns';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  await recoverStaleRuns();

  let runId;
  try {
    const body = await req.json();
    runId = body.runId;
  } catch {
    return NextResponse.json({ error: 'Missing runId' }, { status: 400 });
  }

  if (!runId) {
    return NextResponse.json({ error: 'Missing runId' }, { status: 400 });
  }

  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  if (run.status !== 'running') {
    return NextResponse.json({
      success: false,
      message: `This run is already ${run.status}.`,
    });
  }

  markCancelling(run.id);

  if (run.pid) {
    try {
      await killProcessTree(run.pid);
    } catch (err) {
      return NextResponse.json({ error: `Could not stop the process: ${err.message}` }, { status: 500 });
    }
  }

  const duration = `${((Date.now() - new Date(run.start_time).getTime()) / 1000).toFixed(1)}s`;
  await prisma.pipelineRun.update({
    where: { id: run.id },
    data: {
      status: 'cancelled',
      cancelled: true,
      stage: 'cancelled',
      end_time: new Date(),
      duration,
      pid: null,
    },
  });

  return NextResponse.json({ success: true });
}
