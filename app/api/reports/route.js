import { NextResponse } from 'next/server';
import { listReportsPage, REPORT_PAGE_SIZE } from '../../../lib/reports/listReports';

export const dynamic = 'force-dynamic';

const reportsCache = new Map();
const CACHE_TTL_MS = 15000;

export async function GET(request) {
  const url = new URL(request.url);
  try {
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || REPORT_PAGE_SIZE;
    const account = url.searchParams.get('account') || 'all';
    const status = url.searchParams.get('status') || 'all';
    const q = url.searchParams.get('q') || '';

    const cacheKey = `${page}:${pageSize}:${account}:${status}:${q}`;
    const cached = reportsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    const data = await listReportsPage({ page, pageSize, account, status, q });
    reportsCache.set(cacheKey, { timestamp: Date.now(), data });

    // Clean old cache entries if map grows
    if (reportsCache.size > 50) {
      const now = Date.now();
      for (const [k, v] of reportsCache.entries()) {
        if (now - v.timestamp >= CACHE_TTL_MS) reportsCache.delete(k);
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Reports could not be loaded.' }, { status: 500 });
  }
}
