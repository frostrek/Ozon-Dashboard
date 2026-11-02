import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { changePostingStatus } from '../../../../lib/ozon/changeOrderStatus';
import {
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
      name: String(row?.name || '').trim(),
      quantity: Number(row?.quantity) || 1,
      postingNumber: String(row?.postingNumber || '').trim(),
      warehouse: String(row?.warehouse || '').trim(),
    }))
    .filter((row) => row.orderId || row.postingNumber);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function packForLabel(order) {
  if (!order.account) throw new Error(`${order.posting_number}: this order has no linked Ozon account.`);
  const liveStatus = String(order.parsed?.status || '').trim();
  if (liveStatus === 'cancelled' || order.status === 'CANCELLED') {
    throw new Error(`${order.posting_number} is cancelled, so Ozon has no shipping label.`);
  }
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

async function printLabel(account, postingNumber) {
  let lastError = 'Ozon did not return a shipping label.';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(2000);
    try {
      return await fetchShippingLabelPdf(account, [postingNumber]);
    } catch (error) {
      lastError = error.message || lastError;
    }
  }
  throw new Error(lastError);
}

function wanted(lines, orderId, sku) {
  if (!lines.length) return true;
  return lines.some((line) => line.orderId === orderId && (!line.sku || line.sku === sku));
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const kind = body.kind === 'product' ? 'product' : body.kind === 'shipping' ? 'shipping' : '';
  const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 250);
  const lines = selectedLines(body);
  const postingNumbers = [...new Set([
    ...(Array.isArray(body.postingNumbers) ? body.postingNumbers : []),
    ...lines.map((line) => line.postingNumber),
  ].map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 250);
  if (!kind) return NextResponse.json({ error: 'Choose a shipping label or a product list.' }, { status: 400 });
  if (!ids.length && !postingNumbers.length) return NextResponse.json({ error: 'Select at least one product.' }, { status: 400 });

  const rows = await prisma.order.findMany({
    where: {
      OR: [
        ids.length ? { id: { in: ids } } : undefined,
        postingNumbers.length ? { posting_number: { in: postingNumbers } } : undefined,
      ].filter(Boolean),
    },
  });
  const accounts = await prisma.account.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.account_id).filter(Boolean))] } },
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const hydrate = (row) => {
    let parsed = {};
    try { parsed = JSON.parse(row.raw_json || '{}'); } catch { parsed = {}; }
    return { ...row, parsed, account: accountById.get(String(row.account_id)) || null };
  };
  const byId = new Map(rows.map((row) => [String(row.id), hydrate(row)]));
  const byPosting = new Map(rows.map((row) => [String(row.posting_number), hydrate(row)]));
  const orders = [
    ...ids.map((id) => byId.get(String(id))),
    ...postingNumbers.map((number) => byPosting.get(number)),
  ].filter(Boolean);
  const uniqueOrders = [];
  const seenOrders = new Set();
  orders.forEach((order) => {
    if (seenOrders.has(order.id)) return;
    seenOrders.add(order.id);
    uniqueOrders.push(order);
  });
  if (!uniqueOrders.length) return NextResponse.json({ error: 'Those orders are not in the dashboard.' }, { status: 404 });
  const orderList = uniqueOrders;

  try {
    if (kind === 'shipping') {
      const selectedPostings = postingNumbers.length
        ? postingNumbers
        : [...new Set(orderList.map((order) => order.posting_number))];
      const pdfs = [];
      const warnings = [];
      for (const postingNumber of selectedPostings) {
        const order = byPosting.get(postingNumber) || orderList.find((item) => item.posting_number === postingNumber);
        if (!order) {
          warnings.push(`${postingNumber}: this order is not in the dashboard.`);
          continue;
        }
        try {
          await packForLabel(order);
        } catch (error) {
          warnings.push(error.message || `${postingNumber}: could not pack this order`);
        }
        try {
          const file = await printLabel(order.account, postingNumber);
          pdfs.push(file.bytes);
          warnings.push(...file.warnings);
        } catch (error) {
          warnings.push(`${postingNumber}: ${error.message || 'shipping label was not printed'}`);
        }
      }
      if (!pdfs.length) {
        return NextResponse.json({
          error: warnings[0] || 'Ozon could not print shipping labels for the selected orders.',
        }, { status: 400 });
      }
      const pdf = await mergePdfs(pdfs);
      const skipped = selectedPostings.length - pdfs.length;
      const headers = {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ozon-shipping-labels.pdf"',
        'Cache-Control': 'no-store',
        'X-Printed-Count': String(pdfs.length),
        'X-Requested-Count': String(selectedPostings.length),
        'Access-Control-Expose-Headers': 'X-Document-Note, X-Printed-Count, X-Requested-Count',
      };
      if (skipped > 0) warnings.unshift(`Printed ${pdfs.length} of ${selectedPostings.length} shipping labels.`);
      if (warnings.length) headers['X-Document-Note'] = headerNote(warnings.slice(0, 8).join(' '));
      return new NextResponse(pdf, { headers });
    }

    const saved = lines.length
      ? lines.map((line) => {
        const order = orderList.find((item) => String(item.id) === String(line.orderId))
          || byPosting.get(line.postingNumber);
        const fromOrder = order ? productsOf(order).find((product) => !line.sku || product.sku === line.sku) : null;
        return {
          orderId: line.orderId,
          postingNumber: line.postingNumber || order?.posting_number || '',
          warehouse: line.warehouse || order?.parsed?.delivery_method?.warehouse || '',
          name: line.name || fromOrder?.name || 'Product',
          sku: line.sku || fromOrder?.sku || '',
          quantity: line.quantity || fromOrder?.quantity || 1,
        };
      }).filter((row) => row.postingNumber)
      : [];
    if (!saved.length) {
      orderList.forEach((order) => {
        productsOf(order).forEach((product) => {
          if (wanted(lines, product.orderId, product.sku)) saved.push(product);
        });
      });
    }
    if (!saved.length) {
      return NextResponse.json({ error: 'The selected products could not be added to the list.' }, { status: 400 });
    }
    const rowsForPdf = saved;
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
