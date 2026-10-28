import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { nextOzonStatuses } from '../../../../lib/orders/statusMap';
import { changePostingStatus, listCancelReasons } from '../../../../lib/ozon/changeOrderStatus';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TARGETS = new Set(['awaiting_deliver', 'delivering', 'delivered', 'cancelled']);

async function loadOrders(ids) {
  return prisma.order.findMany({
    where: { id: { in: ids } },
    include: { account: true },
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 50);
  if (!ids.length) return NextResponse.json({ error: 'Select at least one order.' }, { status: 400 });

  const rows = await loadOrders(ids);
  if (!rows.length) return NextResponse.json({ error: 'Those orders are no longer on this page.' }, { status: 404 });

  if (body.action === 'reasons') {
    const order = rows[0];
    try {
      const reasons = await listCancelReasons(order.account, order.posting_number);
      return NextResponse.json({ reasons });
    } catch (error) {
      return NextResponse.json({ error: error.message || 'Cancellation reasons could not be loaded.' }, { status: 500 });
    }
  }

  const target = String(body.status || '');
  if (!TARGETS.has(target)) return NextResponse.json({ error: 'Choose a status Ozon can accept.' }, { status: 400 });

  const updated = [];
  const failed = [];
  for (const order of rows) {
    let parsed = {};
    try { parsed = JSON.parse(order.raw_json || '{}'); } catch { parsed = {}; }
    const current = parsed.status || '';
    const allowed = nextOzonStatuses(current, parsed.tpl_integration_type);
    if (!allowed.includes(target)) {
      failed.push({ id: order.id, postingNumber: order.posting_number, error: 'Ozon does not allow that status change for this order.' });
      continue;
    }
    try {
      const result = await changePostingStatus(order.account, { ...parsed, posting_number: order.posting_number }, target, {
        reasonId: body.cancelReasonId,
        message: body.cancelReasonMessage,
      });
      parsed.status = result.ozonStatus;
      await prisma.order.update({
        where: { id: order.id },
        data: { status: result.status, raw_json: JSON.stringify(parsed) },
      });
      await prisma.orderStatusHistory.create({
        data: { order_id: order.id, status: result.status },
      });
      updated.push({ id: order.id, status: result.status, ozonStatus: result.ozonStatus, postingNumber: order.posting_number });
    } catch (error) {
      failed.push({ id: order.id, postingNumber: order.posting_number, error: error.message || 'Ozon did not change this order.' });
    }
  }

  return NextResponse.json({ updated, failed });
}
