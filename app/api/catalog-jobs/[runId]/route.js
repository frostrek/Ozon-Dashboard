import { NextResponse } from 'next/server';
import { deleteCatalogRun, isSafeRunId, readCatalogStatus } from '../../../../lib/catalog/listRuns';

export const dynamic = 'force-dynamic';

export async function DELETE(_request, { params }) {
  const { runId } = params;
  if (!isSafeRunId(runId)) {
    return NextResponse.json({ error: 'That run id is not valid.' }, { status: 400 });
  }
  const status = await readCatalogStatus(runId);
  if (status && (status.status === 'pending' || status.status === 'running')) {
    return NextResponse.json({ error: 'Wait until this run finishes before deleting it.' }, { status: 409 });
  }
  deleteCatalogRun(runId);
  return NextResponse.json({ ok: true, runId });
}
