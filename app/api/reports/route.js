import { NextResponse } from 'next/server';
import { listReportsPage, REPORT_PAGE_SIZE } from '../../../lib/reports/listReports';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  try {
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || REPORT_PAGE_SIZE;
    const data = await listReportsPage({ page, pageSize });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Reports could not be loaded.' }, { status: 500 });
  }
}
