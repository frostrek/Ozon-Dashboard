import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { listRunFiles, serializeRun } from '../../../../lib/pipeline/files';
import { recoverStaleRuns } from '../../../../lib/pipeline/recoverRuns';

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
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 8));
  let page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const accountId = String(url.searchParams.get('accountId') || '');
  const from = String(url.searchParams.get('from') || '');
  const to = String(url.searchParams.get('to') || '');
  const where = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    where.start_time = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) where.start_time.gte = new Date(`${from}T00:00:00.000Z`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const end = new Date(`${to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      where.start_time.lt = end;
    }
  }

  const total = await prisma.pipelineRun.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (page > pageCount) page = pageCount;

  const runs = await prisma.pipelineRun.findMany({
    where,
    include: { account: { select: { id: true, name: true } } },
    orderBy: { start_time: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const payload = [];
  for (const run of runs) {
    payload.push(serializeRun(run, await listRunFiles(run.run_dir)));
  }

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
    console.error('[pipeline/runs]', error);
    return NextResponse.json({ error: error.message || 'Could not load run history.' }, { status: 500 });
  }
}
