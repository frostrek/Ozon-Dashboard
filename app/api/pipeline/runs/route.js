import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { listRunFiles, serializeRun } from '../../../../lib/pipeline/files';
import { recoverStaleRuns } from '../../../../lib/pipeline/recoverRuns';
import { accountNamesById } from '../../../../lib/accountNames';

export const dynamic = 'force-dynamic';

function briefRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    account_id: run.account_id,
    status: run.status,
    stage: run.stage,
    start_time: run.start_time,
    end_time: run.end_time,
    cancelled: run.cancelled,
    error_message: run.error_message || '',
    log_excerpt: run.log_excerpt || '',
  };
}

export async function GET(req) {
  try {
    await recoverStaleRuns();
  } catch (error) {
    console.error('[pipeline/runs] stale cleanup failed:', error.message);
  }
  try {
    const url = new URL(req.url);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 15));
    let page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const accountId = String(url.searchParams.get('accountId') || '');

    const total = await prisma.pipelineRun.count();
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    if (page > pageCount && pageCount > 0) page = pageCount;

    const runs = await prisma.pipelineRun.findMany({
      orderBy: { start_time: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const names = await accountNamesById(runs.map((run) => run.account_id));

    const payload = await Promise.all(runs.map(async (run) => {
      const files = await listRunFiles(run.run_dir);
      return serializeRun({ ...run, account: { name: names[run.account_id] || null } }, files);
    }));

    const accountWhere = accountId ? { account_id: accountId } : null;
    const [lastRun, lastSuccess, running] = accountWhere
      ? await Promise.all([
        prisma.pipelineRun.findFirst({ where: accountWhere, orderBy: { start_time: 'desc' } }),
        prisma.pipelineRun.findFirst({
          where: { ...accountWhere, status: 'success', cancelled: false },
          orderBy: { start_time: 'desc' },
        }),
        prisma.pipelineRun.findFirst({
          where: { ...accountWhere, status: 'running' },
          orderBy: { start_time: 'desc' },
        }),
      ])
      : [null, null, null];

    return NextResponse.json({
      runs: payload,
      total,
      page,
      pageSize,
      lastRun: briefRun(lastRun),
      lastSuccess: briefRun(lastSuccess),
      running: briefRun(running),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Pipeline runs could not be loaded.' }, { status: 500 });
  }
}
