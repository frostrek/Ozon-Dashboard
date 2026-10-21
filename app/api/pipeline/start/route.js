import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { startPipelineRun } from '../../../../lib/pipeline/spawnRun';
import { recoverStaleRuns } from '../../../../lib/pipeline/recoverRuns';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  await recoverStaleRuns();

  try {
    let accountId;
    let runAll = false;

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      accountId = body.accountId;
      runAll = Boolean(body.all);
    } else {
      const formData = await req.formData();
      accountId = formData.get('accountId');
      runAll = Boolean(formData.get('all'));
    }

    if (runAll) {
      const accounts = await prisma.account.findMany({ where: { active: true } });
      const runIds = [];
      const skipped = [];
      for (const account of accounts) {
        if (!account.client_id || !account.api_key) continue;
        try {
          const started = await startPipelineRun(account.id);
          runIds.push(started.runId);
        } catch (err) {
          if (err.status === 409) {
            skipped.push({ accountId: account.id, error: err.message });
            continue;
          }
          throw err;
        }
      }
      return NextResponse.json({ runIds, skipped });
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Missing account info' }, { status: 400 });
    }

    const started = await startPipelineRun(String(accountId));
    return NextResponse.json({ runId: started.runId, pid: started.pid });
  } catch (error) {
    const status = error.status || 500;
    console.error('[API /pipeline/start] ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status });
  }
}
