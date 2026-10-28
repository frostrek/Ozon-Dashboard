import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { renderOrdersToPdf } from '../../../../03-generate.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 250);
  if (!ids.length) {
    return NextResponse.json({ error: 'Select at least one order.' }, { status: 400 });
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
    return NextResponse.json({ error: 'The selected orders have no saved details to print.' }, { status: 400 });
  }

  try {
    const pdf = await renderOrdersToPdf(orders);
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="orders.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'The PDF could not be created.' }, { status: 500 });
  }
}
