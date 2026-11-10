import { NextResponse } from 'next/server';
import { getOzonOrderCharges } from '../../../lib/charges/orderCharges.js';

export const dynamic = 'force-dynamic';

const chargesCache = new Map();
const CACHE_TTL_MS = 30000;

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const accountId = url.searchParams.get('account') || 'all';
    const from = url.searchParams.get('from') || undefined;
    const to = url.searchParams.get('to') || undefined;

    const cacheKey = `${accountId}:${from}:${to}`;
    const cached = chargesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, ...cached.data });
    }

    const data = await getOzonOrderCharges({ accountId, from, to });
    chargesCache.set(cacheKey, { timestamp: Date.now(), data });

    if (chargesCache.size > 50) {
      const now = Date.now();
      for (const [k, v] of chargesCache.entries()) {
        if (now - v.timestamp >= CACHE_TTL_MS) chargesCache.delete(k);
      }
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('[api/charges]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to calculate Ozon order charges' },
      { status: 500 }
    );
  }
}

