import { NextResponse } from 'next/server';
import { orderStatusCounts } from '../../../../lib/orders/listOrders';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const counts = await orderStatusCounts('all');
    return NextResponse.json({
      counts: counts || {},
      pending: (counts?.AWAITING_PACKAGING || 0) + (counts?.AWAITING_DELIVERY || 0),
      total: counts?._total || 0,
    });
  } catch (error) {
    return NextResponse.json({ counts: {}, pending: 0, total: 0 });
  }
}

