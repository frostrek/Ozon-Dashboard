import { NextResponse } from 'next/server';
import { productTabCounts } from '../../../../lib/products/listProducts';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const account = url.searchParams.get('account') || 'all';
  try {
    const counts = await productTabCounts(account);
    return NextResponse.json({ counts });
  } catch (error) {
    return NextResponse.json({ counts: {} });
  }
}

