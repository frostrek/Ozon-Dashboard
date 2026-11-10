import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { renderOrdersToPdf } from '../../../../03-generate.js';
import { translateBulk } from '../../../../lib/labels/utils/translate';
import { renderThermalLabelsForOrders } from '../../../../lib/labels/thermalOrderService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const hasRussian = (str) => typeof str === 'string' && /[а-яА-ЯёЁ]/.test(str);

async function translateOrdersForPdf(orders) {
  const textsToTranslate = new Set();
  for (const order of orders) {
    if (hasRussian(order?.customer?.name)) textsToTranslate.add(order.customer.name.trim());
    if (hasRussian(order?.customer?.address?.address_tail)) textsToTranslate.add(order.customer.address.address_tail.trim());
    if (hasRussian(order?.customer?.address?.city)) textsToTranslate.add(order.customer.address.city.trim());
    if (hasRussian(order?.financial_data?.cluster_to)) textsToTranslate.add(order.financial_data.cluster_to.trim());
    if (hasRussian(order?.addressee?.name)) textsToTranslate.add(order.addressee.name.trim());
    if (hasRussian(order?.delivery_method?.warehouse)) textsToTranslate.add(order.delivery_method.warehouse.trim());
    if (hasRussian(order?.delivery_method?.tpl_provider)) textsToTranslate.add(order.delivery_method.tpl_provider.trim());
    if (hasRussian(order?.delivery_method?.name)) textsToTranslate.add(order.delivery_method.name.trim());
    if (hasRussian(order?.cancellation?.cancel_reason)) textsToTranslate.add(order.cancellation.cancel_reason.trim());
    if (hasRussian(order?.cancellation?.cancellation_initiator)) textsToTranslate.add(order.cancellation.cancellation_initiator.trim());
    for (const product of order?.products || []) {
      if (hasRussian(product?.name)) textsToTranslate.add(product.name.trim());
    }
  }

  if (textsToTranslate.size === 0) return orders;

  const uniqueTexts = [...textsToTranslate];
  try {
    const translations = await translateBulk(uniqueTexts);
    const transMap = new Map();
    uniqueTexts.forEach((orig, idx) => {
      if (translations[idx]) transMap.set(orig, translations[idx]);
    });

    const swap = (val) => {
      const s = String(val || '').trim();
      return transMap.get(s) || val;
    };

    return orders.map((order) => {
      const copy = { ...order };
      if (copy.customer) {
        copy.customer = {
          ...copy.customer,
          name: swap(copy.customer.name),
          address: copy.customer.address
            ? {
                ...copy.customer.address,
                address_tail: swap(copy.customer.address.address_tail),
                city: swap(copy.customer.address.city),
              }
            : copy.customer.address,
        };
      }
      if (copy.financial_data) {
        copy.financial_data = {
          ...copy.financial_data,
          cluster_to: swap(copy.financial_data.cluster_to),
        };
      }
      if (copy.addressee) {
        copy.addressee = {
          ...copy.addressee,
          name: swap(copy.addressee.name),
        };
      }
      if (copy.delivery_method) {
        copy.delivery_method = {
          ...copy.delivery_method,
          warehouse: swap(copy.delivery_method.warehouse),
          tpl_provider: swap(copy.delivery_method.tpl_provider),
          name: swap(copy.delivery_method.name),
        };
      }
      if (copy.cancellation) {
        copy.cancellation = {
          ...copy.cancellation,
          cancel_reason: swap(copy.cancellation.cancel_reason),
          cancellation_initiator: swap(copy.cancellation.cancellation_initiator),
        };
      }
      if (Array.isArray(copy.products)) {
        copy.products = copy.products.map((p) => ({
          ...p,
          name: swap(p.name),
        }));
      }
      return copy;
    });
  } catch (err) {
    console.warn('[orders/pdf] Translation error:', err.message);
    return orders;
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 250);
  const format = String(body.format || 'thermal').toLowerCase();

  if (!ids.length) {
    return NextResponse.json({ error: 'Select at least one order.' }, { status: 400 });
  }

  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: { account: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const orders = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    let parsed = {};
    try {
      parsed = row.raw_json ? JSON.parse(row.raw_json) : {};
    } catch {}
    orders.push({
      ...row,
      parsed,
      ...parsed,
      posting_number: row.posting_number || parsed.posting_number,
    });
  }
  if (!orders.length) {
    return NextResponse.json({ error: 'The selected orders have no saved details to print.' }, { status: 400 });
  }

  try {
    if (format === 'manifest') {
      const translatedOrders = await translateOrdersForPdf(orders);
      const pdf = await renderOrdersToPdf(translatedOrders);
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="orders-manifest.pdf"',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Default: 4×6 Thermal Shipping Label (matching Image 2)
    const pdf = await renderThermalLabelsForOrders(orders);
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="thermal-labels.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'The PDF could not be created.' }, { status: 500 });
  }
}
