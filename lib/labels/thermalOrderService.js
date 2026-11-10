import { prisma } from '../prisma.js';
import { fetchShippingLabelPdf, mergePdfs } from '../ozon/fbsDocuments.js';
import { changePostingStatus } from '../ozon/changeOrderStatus.js';
import { createThermalPDFWithDetails } from './pdf/generate.js';
import { translateBulk } from './utils/translate.js';

const hasRussian = (str) => typeof str === 'string' && /[а-яА-ЯёЁ]/.test(str);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function renderThermalLabelsForOrders(orders) {
  const list = Array.isArray(orders) ? orders.filter((o) => o?.posting_number) : [];
  if (!list.length) throw new Error('No valid orders selected for thermal label printing.');

  // Collect Russian product titles for translation
  const titlesToTranslate = [];
  list.forEach((order) => {
    (order.products || []).forEach((prod) => {
      if (hasRussian(prod.name || prod.title)) {
        titlesToTranslate.push(String(prod.name || prod.title).trim());
      }
    });
  });

  const translationMap = new Map();
  if (titlesToTranslate.length > 0) {
    try {
      const unique = [...new Set(titlesToTranslate)];
      const translated = await translateBulk(unique);
      unique.forEach((orig, idx) => {
        if (translated[idx]) translationMap.set(orig, translated[idx]);
      });
    } catch (err) {
      console.warn('[thermalOrderService] Title translation warning:', err.message);
    }
  }

  const individualPdfs = [];

  for (const order of list) {
    const parsed = order.parsed || order;
    const postingNumber = order.posting_number;

    if (!order.account) {
      throw new Error(`Order ${postingNumber} is not linked to any active Ozon account.`);
    }

    // Format products with translated titles
    const products = (parsed.products || order.products || []).map((p) => {
      const orig = String(p.name || p.title || 'Product').trim();
      const translated = translationMap.get(orig) || orig;
      return {
        title: translated,
        sku: String(p.offer_id || p.sku || 'N/A').trim(),
        qty: String(p.quantity || 1),
      };
    });

    let ozonPdfBytes = null;

    // 1. First attempt to fetch the official Ozon label
    try {
      const result = await fetchShippingLabelPdf(order.account, [postingNumber]);
      if (result?.bytes && result.bytes.length > 500) {
        ozonPdfBytes = result.bytes;
      }
    } catch (firstErr) {
      const errMsg = String(firstErr.message || '');
      // If Ozon reports the order is not packed yet, pack it on Ozon and retry!
      if (/NO_POSTINGS_FOR_BATCH_DOWNLOAD|pack them first|awaiting_deliver|HAS_INCORRECT_STATUS/i.test(errMsg)) {
        console.info(`[thermalOrderService] Order ${postingNumber} needs to be packed on Ozon first. Packing now...`);
        try {
          const packResult = await changePostingStatus(
            order.account,
            { ...parsed, posting_number: postingNumber },
            'awaiting_deliver'
          );

          // Update local DB status to match
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: packResult.status || 'AWAITING_DELIVERY',
              raw_json: JSON.stringify({ ...parsed, status: packResult.ozonStatus || 'awaiting_deliver' }),
            },
          }).catch(() => {});

          // Give Ozon time to generate the package label task
          await sleep(2500);

          // Retry fetching official shipping label
          const retryResult = await fetchShippingLabelPdf(order.account, [postingNumber]);
          if (retryResult?.bytes && retryResult.bytes.length > 500) {
            ozonPdfBytes = retryResult.bytes;
          }
        } catch (packErr) {
          console.error(`[thermalOrderService] Pack & print failed for ${postingNumber}:`, packErr.message);
          throw new Error(`Order ${postingNumber} could not be packed on Ozon: ${packErr.message}`);
        }
      } else {
        throw firstErr;
      }
    }

    if (!ozonPdfBytes || ozonPdfBytes.length < 500) {
      throw new Error(`Ozon did not return the official shipping label for ${postingNumber}. Please check the order status on Ozon Seller.`);
    }

    // Embed the official Ozon vector label at the top, add barcode and translated product details at the bottom
    const pagesData = [{
      pageIndex: 0,
      shipmentId: postingNumber,
      products,
    }];

    const mergedThermalBytes = await createThermalPDFWithDetails(ozonPdfBytes, pagesData);
    individualPdfs.push(Buffer.from(mergedThermalBytes));
  }

  if (individualPdfs.length === 1) {
    return individualPdfs[0];
  }

  return mergePdfs(individualPdfs);
}
