import { NextResponse } from 'next/server';
import { getOzonOrderCharges } from '../../../../lib/charges/orderCharges.js';
import { buildChargesWorkbook } from '../../../../lib/charges/chargesExcel.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { accountId = 'all', from, to, selectedIds = [] } = body;

    const data = await getOzonOrderCharges({ accountId, from, to });
    let ordersToExport = data.orders || [];

    if (Array.isArray(selectedIds) && selectedIds.length > 0) {
      const idSet = new Set(selectedIds.map(String));
      ordersToExport = ordersToExport.filter((o) => idSet.has(String(o.id)));
    }

    if (!ordersToExport.length) {
      return NextResponse.json({ error: 'No orders available to export.' }, { status: 400 });
    }

    const buffer = await buildChargesWorkbook(ordersToExport, data.dateRange);
    const dateRangeFrom = data.dateRange?.from || from || 'start';
    const dateRangeTo = data.dateRange?.to || to || 'end';
    const filename = `Ozon_Order_Charges_${dateRangeFrom}_to_${dateRangeTo}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[api/charges/export]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Excel report' },
      { status: 500 }
    );
  }
}

