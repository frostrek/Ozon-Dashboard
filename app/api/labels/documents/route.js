import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { changePostingStatus } from '../../../../lib/ozon/changeOrderStatus';
import {
  fetchShippingLabelPdf,
  mergePdfs,
  renderProductListPdf,
} from '../../../../lib/ozon/fbsDocuments';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LABEL_BATCH = 20;
const PACK_CONCURRENCY = 4;

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
      image: String(row?.image || '').trim(),
      deliveryService: String(row?.deliveryService || '').trim(),
    }))
    .filter((row) => row.orderId || row.postingNumber);
}

function firstHttpUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^https?:\/\//i.test(text) || text.startsWith('data:image/')) return text;
    return '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstHttpUrl(item);
      if (url) return url;
    }
    return '';
  }
  if (typeof value === 'object') {
    return firstHttpUrl(value.url || value.src || value.href || value.file_name);
  }
  return '';
}

function productsOf(order) {
  const parsed = order.parsed || {};
  const warehouse = parsed.delivery_method?.warehouse || '';
  const deliveryService = parsed.delivery_method?.tpl_provider || parsed.delivery_method?.name || '';
  return (Array.isArray(parsed.products) ? parsed.products : []).map((product) => ({
    orderId: order.id,
    postingNumber: order.posting_number,
    warehouse,
    deliveryService,
    name: product.name || product.title || 'Product',
    sku: String(product.offer_id || product.sku || '').trim(),
    quantity: Number(product.quantity) || 1,
    image: firstHttpUrl(product.primary_image || product.photo || product.image || product.images || product.picture),
  }));
}

function headerNote(value) {
  return String(value || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function runPool(items, size, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) || 1 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      await worker(item);
    }
  }));
}

async function packForLabel(order) {
  if (!order.account) throw new Error(`${order.posting_number}: this order has no linked Ozon account.`);
  const liveStatus = String(order.parsed?.status || '').trim();
  if (liveStatus === 'cancelled' || order.status === 'CANCELLED') {
    throw new Error(`${order.posting_number} is cancelled, so Ozon has no shipping label.`);
  }
  if (liveStatus === 'awaiting_deliver' || order.status === 'AWAITING_DELIVERY') return order;
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

function unprintedFrom(warnings, batch) {
  const wanted = new Set(batch);
  return (warnings || [])
    .map((row) => String(row).split(':')[0].trim())
    .filter((number) => wanted.has(number));
}

async function printBatch(account, numbers, warnings) {
  const pdfs = [];
  let printed = 0;
  for (let index = 0; index < numbers.length; index += LABEL_BATCH) {
    const batch = numbers.slice(index, index + LABEL_BATCH);
    let leftover = batch;
    try {
      const file = await fetchShippingLabelPdf(account, batch);
      pdfs.push(file.bytes);
      warnings.push(...file.warnings);
      leftover = unprintedFrom(file.warnings, batch);
      printed += batch.length - leftover.length;
    } catch (error) {
      leftover = batch;
      warnings.push(error.message || 'A batch of shipping labels could not be printed.');
    }
    for (const postingNumber of leftover) {
      try {
        const file = await fetchShippingLabelPdf(account, [postingNumber]);
        pdfs.push(file.bytes);
        warnings.push(...file.warnings);
        printed += 1;
      } catch (error) {
        warnings.push(`${postingNumber}: ${error.message || 'shipping label was not printed'}`);
      }
    }
  }
  return { pdfs, printed };
}

function wanted(lines, orderId, sku) {
  if (!lines.length) return true;
  return lines.some((line) => line.orderId === orderId && (!line.sku || line.sku === sku));
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const kind = body.kind === 'product' ? 'product' : body.kind === 'shipping' ? 'shipping' : '';
  const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 1000);
  const lines = selectedLines(body);
  const postingNumbers = [...new Set([
    ...(Array.isArray(body.postingNumbers) ? body.postingNumbers : []),
    ...lines.map((line) => line.postingNumber),
  ].map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 1000);
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
      const warnings = [];
      const printable = [];
      await runPool(selectedPostings, PACK_CONCURRENCY, async (postingNumber) => {
        const order = byPosting.get(postingNumber) || orderList.find((item) => item.posting_number === postingNumber);
        if (!order) {
          warnings.push(`${postingNumber}: this order is not in the dashboard.`);
          return;
        }
        try {
          await packForLabel(order);
        } catch (error) {
          warnings.push(error.message || `${postingNumber}: could not pack this order`);
        }
        if (order.account) printable.push(order);
      });
      const pdfs = [];
      let printed = 0;
      const groups = new Map();
      printable.forEach((order) => {
        const key = String(order.account_id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(order);
      });
      for (const group of groups.values()) {
        const numbers = [...new Set(group.map((order) => order.posting_number))];
        const file = await printBatch(group[0].account, numbers, warnings);
        pdfs.push(...file.pdfs);
        printed += file.printed;
      }
      if (!pdfs.length) {
        return NextResponse.json({
          error: warnings[0] || 'Ozon could not print shipping labels for the selected orders.',
        }, { status: 400 });
      }
      const pdf = await mergePdfs(pdfs);
      const headers = {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ozon-shipping-labels.pdf"',
        'Cache-Control': 'no-store',
        'X-Printed-Count': String(printed),
        'X-Requested-Count': String(selectedPostings.length),
        'Access-Control-Expose-Headers': 'X-Document-Note, X-Printed-Count, X-Requested-Count',
      };
      if (printed < selectedPostings.length) {
        warnings.unshift(`Printed ${printed} of ${selectedPostings.length} shipping labels.`);
      }
      if (warnings.length) headers['X-Document-Note'] = headerNote(warnings.slice(0, 12).join(' '));
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
          warehouse: line.warehouse || fromOrder?.warehouse || order?.parsed?.delivery_method?.warehouse || '',
          deliveryService: fromOrder?.deliveryService || order?.parsed?.delivery_method?.tpl_provider || order?.parsed?.delivery_method?.name || '',
          name: line.name || fromOrder?.name || 'Product',
          sku: line.sku || fromOrder?.sku || '',
          quantity: line.quantity || fromOrder?.quantity || 1,
          image: fromOrder?.image || '',
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
    const meta = {
      warehouse: rowsForPdf.find((r) => r.warehouse)?.warehouse || orderList[0]?.parsed?.delivery_method?.warehouse || 'Mumbai Warehouse',
      deliveryService: rowsForPdf.find((r) => r.deliveryService)?.deliveryService || orderList[0]?.parsed?.delivery_method?.tpl_provider || orderList[0]?.parsed?.delivery_method?.name || 'GBS & MyIndia Extra Small Express IN',
      shipmentQuantity: new Set(rowsForPdf.map((r) => r.postingNumber)).size,
    };

    const pdf = await renderProductListPdf(rowsForPdf, meta);
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
