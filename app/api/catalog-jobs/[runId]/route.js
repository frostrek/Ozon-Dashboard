import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { assignRunAccount, deleteCatalogRun, isSafeRunId, readCatalogJob, readCatalogStatus, stopCatalogRun } from '../../../../lib/catalog/listRuns';
import { loadCatalogRun } from '../../../../lib/catalog/runStore';
import { startCatalogJob } from '../../../../lib/catalog/spawnCatalogJob';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  if (!isSafeRunId(params.runId)) {
    return NextResponse.json({ error: 'That run id is not valid.' }, { status: 400 });
  }
  const status = await readCatalogStatus(params.runId);
  if (!status) return NextResponse.json({ error: 'This run is not on the server.' }, { status: 404 });
  return NextResponse.json(status);
}

export async function POST(request, { params }) {
  if (!isSafeRunId(params.runId)) {
    return NextResponse.json({ error: 'That run id is not valid.' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  if (body.action === 'stop') {
    if (!await stopCatalogRun(params.runId)) {
      return NextResponse.json({ error: 'This run is not on the server.' }, { status: 404 });
    }
    const status = await readCatalogStatus(params.runId);
    if (!status) return NextResponse.json({ error: 'This run is not on the server.' }, { status: 404 });
    return NextResponse.json(status);
  }
  if (body.action === 'account') {
    const nextAccount = await prisma.account.findUnique({ where: { id: String(body.accountId || '') } });
    if (!nextAccount?.client_id || !nextAccount?.api_key) {
      return NextResponse.json({ error: 'That account has no Ozon client id or API key.' }, { status: 400 });
    }
    if (!await assignRunAccount(params.runId, nextAccount.id)) {
      return NextResponse.json({ error: 'This run is not on the server.' }, { status: 404 });
    }
    const status = await readCatalogStatus(params.runId);
    if (!status) return NextResponse.json({ error: 'This run is not on the server.' }, { status: 404 });
    return NextResponse.json({ ...status, accountName: nextAccount.name });
  }
  let job = readCatalogJob(params.runId);
  if (!job) {
    const stored = await loadCatalogRun(params.runId).catch(() => null);
    job = stored?.job || null;
  }
  if (!job) return NextResponse.json({ error: 'This run is not on the server.' }, { status: 404 });
  const account = await prisma.account.findUnique({ where: { id: String(job.accountId || '') } });
  if (!account?.client_id || !account?.api_key) {
    return NextResponse.json({ error: 'That account has no Ozon client id or API key.' }, { status: 400 });
  }
  try {
    startCatalogJob({
      runId: params.runId,
      account,
      preserveStatus: true,
      job: {
      ...job,
      action: body.action || job.action || 'push',
      asin: body.asin || job.asin || '',
      asins: body.asins || (body.asin ? [body.asin] : job.asins) || [],
    },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'The run could not be continued.' }, { status: error.status || 500 });
  }
  return NextResponse.json({ ok: true, runId: params.runId });
}

export async function DELETE(_request, { params }) {
  const { runId } = params;
  if (!isSafeRunId(runId)) {
    return NextResponse.json({ error: 'That run id is not valid.' }, { status: 400 });
  }
  const status = await readCatalogStatus(runId);
  if (status && (status.status === 'pending' || status.status === 'running')) {
    return NextResponse.json({ error: 'Wait until this run finishes before deleting it.' }, { status: 409 });
  }
  await deleteCatalogRun(runId);
  return NextResponse.json({ ok: true, runId });
}
