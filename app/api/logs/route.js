import { NextResponse } from 'next/server';
import { listLogRunsPage, LOG_PAGE_SIZE } from '../../../lib/logs/listLogs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  try {
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || LOG_PAGE_SIZE;
    const data = await listLogRunsPage({ page, pageSize });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Logs could not be loaded.' }, { status: 500 });
  }
}
