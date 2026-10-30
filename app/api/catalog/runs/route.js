import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { listCatalogRuns } from '../../../../lib/catalog/listRuns';
import { startCatalogJob } from '../../../../lib/catalog/spawnCatalogJob';

export const dynamic = 'force-dynamic';

export async function GET() {
  const runs = await listCatalogRuns();
  return NextResponse.json({
    runs: runs.map((run) => ({
      runId: run.runId,
      keyword: run.keyword,
      status: run.status,
      accountName: run.accountName,
      notice: run.notice,
      startedAt: run.startedAt,
    })),
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!body.accountId) {
    return NextResponse.json({ error: 'Choose a seller account.' }, { status: 400 });
  }
  const account = await prisma.account.findUnique({ where: { id: String(body.accountId) } });
  if (!account?.client_id || !account?.api_key) {
    return NextResponse.json({ error: 'That account has no Ozon client id or API key.' }, { status: 400 });
  }
  const runId = randomBytes(8).toString('hex');
  try {
    startCatalogJob({ runId, account, job: body });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'The catalog run could not be started.' }, { status: error.status || 500 });
  }
  return NextResponse.json({ runId });
}
