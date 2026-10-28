import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { buildShipmentWorkbook, fetchUsdToInrRate } from '../../../../lib/orders/shipmentExcel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 250);
  if (!ids.length) {
    return NextResponse.json({ error: 'No orders match this filter.' }, { status: 400 });
  }

  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: { id: true, raw_json: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const orders = [];
  for (const id of ids) {
    const raw = byId.get(id)?.raw_json;
    if (!raw) continue;
    try {
      orders.push(JSON.parse(raw));
    } catch {
      // Skip a row whose stored order data cannot be read.
    }
  }
  if (!orders.length) {
    return NextResponse.json({ error: 'These orders have no saved details to export.' }, { status: 400 });
  }

  const rate = await fetchUsdToInrRate();
  const buffer = await buildShipmentWorkbook(orders, rate);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="orders.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
