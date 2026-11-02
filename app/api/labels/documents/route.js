import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { dbStatusFor } from '../../../../lib/orders/statusMap';
import { changePostingStatus } from '../../../../lib/ozon/changeOrderStatus';
import {
  fetchAssemblyProducts,
  fetchShippingLabelPdf,
  mergePdfs,
  renderProductListPdf,
} from '../../../../lib/ozon/fbsDocuments';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

function selectedLines(body) {
  const rows = Array.isArray(body.lines) ? body.lines : [];
  return rows
    .map((row) => ({
      orderId: String(row?.orderId || '').trim(),
      sku: String(row?.sku || '').trim(),
    }))
    .filter((row) => row.orderId);
}

function productsOf(order) {
  const parsed = order.parsed || {};
  const warehouse = parsed.delivery_method?.warehouse || '';
  return (Array.isArray(parsed.products) ? parsed.products : []).map((product) => ({
    orderId: order.id,
    postingNumber: order.posting_number,
    warehouse,
    name: product.name || product.title || 'Product',
    sku: String(product.offer_id || product.sku || '').trim(),
    quantity: Number(product.quantity) || 1,
  }));
}

function headerNote(value) {
  return String(value || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function ozonStatusOf(order) {
  return String(order.parsed?.status || '').trim();
}

function waitingForPickup(order) {
  const ozonStatus = ozonStatusOf(order);
  if (ozonStatus) return ozonStatus === 'awaiting_deliver';
  return order.status === 'AWAITING_DELIVERY';
}

function readyToPack(order) {
  const ozonStatus = ozonStatusOf(order);
  if (ozonStatus) return ozonStatus === 'awaiting_packaging' || ozonStatus === 'awaiting_approve';
  return order.status === 'AWAITING_PACKAGING';
}

async function packForLabel(order) {
  if (waitingForPickup(order)) return order;
  if (!readyToPack(order)) return null;
  if (!order.account) throw new Error(`${order.posting_number}: this order has no linked Ozon account.`);
  const result = await changePostingStatus(order.account, { ...order.parsed, posting_number: order.posting_number }, 'awaiting_deliver');
  order.parsed.status = result.ozonStatus;
  await prisma.order.update({
    where: { id: order.id },
    data: { status: result.status, raw_json: JSON.stringify(order.parsed) },
  });
  await prisma.orderStatusHistory.create({
    data: { order_id: order.id, status: result.status },
  });
  return { ...order, status: result.status };
}

function wanted(lines, orderId, sku) {
  if (!lines.length) return true;
  return lines.some((line) => line.orderId === orderId && (!line.sku || line.sku === sku));
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const kind = body.kind === 'product' ? 'product' : body.kind === 'shipping' ? 'shipping' : '';
  const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 250);
  if (!kind) return NextResponse.json({ error: 'Choose a shipping label or a product list.' }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: 'Select at least one product.' }, { status: 400 });

  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
  });
  const accounts = await prisma.account.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.account_id).filter(Boolean))] } },
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const orders = ids.map((id) => byId.get(id)).filter(Boolean).map((row) => {
    let parsed = {};
    try { parsed = JSON.parse(row.raw_json || '{}'); } catch { parsed = {}; }
    return { ...row, parsed, account: accountById.get(row.account_id) || null };
  });
  if (!orders.length) return NextResponse.json({ error: 'Those orders are not in the dashboard.' }, { status: 404 });

  const lines = selectedLines(body);
  const groups = new Map();
  orders.forEach((order) => {
    if (!groups.has(order.account_id)) groups.set(order.account_id, []);
    groups.get(order.account_id).push(order);
  });

  try {
    if (kind === 'shipping') {
      const pdfs = [];
      const warnings = [];
      const printable = [];
      for (const order of orders) {
        try {
          const packed = await packForLabel(order);
          if (packed) printable.push(packed);
          else warnings.push(`${order.posting_number}: Ozon has no shipping label for this status yet.`);
        } catch (error) {
          warnings.push(`${order.posting_number}: ${error.message || 'could not pack this order'}`);
        }
      }
      if (!printable.length) {
        return NextResponse.json({
          error: warnings[0] || 'Ozon could not print shipping labels for the selected orders.',
        }, { status: 400 });
      }
      const printableGroups = new Map();
      printable.forEach((order) => {
        if (!printableGroups.has(order.account_id)) printableGroups.set(order.account_id, []);
        printableGroups.get(order.account_id).push(order);
      });
      for (const group of printableGroups.values()) {
        const account = group[0].account;
        const numbers = [...new Set(group.map((order) => order.posting_number))];
        const file = await fetchShippingLabelPdf(account, numbers);
        pdfs.push(file.bytes);
        warnings.push(...file.warnings);
      }
      const pdf = await mergePdfs(pdfs);
      const headers = {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ozon-shipping-labels.pdf"',
        'Cache-Control': 'no-store',
      };
      if (printable.length < orders.length) {
        const skipped = orders.length - printable.length;
        warnings.unshift(`${skipped} selected order${skipped === 1 ? ' was' : 's were'} skipped.`);
      }
      if (warnings.length) headers['X-Document-Note'] = headerNote(warnings.slice(0, 8).join(' '));
      return new NextResponse(pdf, { headers });
    }

    const saved = [];
    const live = [];
    const notes = [];
    for (const group of groups.values()) {
      const account = group[0].account;
      const numbers = [...new Set(group.map((order) => order.posting_number))];
      group.forEach((order) => {
        productsOf(order).forEach((product) => {
          if (wanted(lines, product.orderId, product.sku)) saved.push(product);
        });
      });
      try {
        const found = await fetchAssemblyProducts(account, numbers);
        found.forEach((product) => {
          const order = group.find((item) => item.posting_number === product.postingNumber);
          if (!order) return;
          if (!wanted(lines, order.id, product.sku)) return;
          live.push({ ...product, warehouse: order.parsed?.delivery_method?.warehouse || '' });
        });
      } catch (error) {
        notes.push(error.message || 'Ozon did not return the product list.');
      }
    }
    const rowsForPdf = live.length ? live : saved;
    if (!rowsForPdf.length) {
      return NextResponse.json({ error: notes[0] || 'The selected orders have no products to list.' }, { status: 400 });
    }
    const pdf = await renderProductListPdf(rowsForPdf);
    const note = 'This product list is built here from the order details Ozon already sent. It is not Ozon’s own PDF.';
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ozon-product-list.pdf"',
        'Cache-Control': 'no-store',
        'X-Document-Note': headerNote(note),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Ozon did not return the document.' }, { status: error.status || 502 });
  }
}
