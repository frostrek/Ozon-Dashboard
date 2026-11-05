import { PDFDocument } from 'pdf-lib';
import { ozonPost } from '../../ozon-http.js';
import { ozonErrorMessage, sellerHeaders } from './sellerClient.js';
import { launchPdfBrowser } from './pdfBrowser.js';
import { translateBulk } from '../labels/utils/translate.js';

const ROOT = 'https://api-seller.ozon.ru';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ozonJson(account, apiPath, body) {
  const response = await ozonPost(`${ROOT}${apiPath}`, body, sellerHeaders(account), 60_000);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: String(text || '').slice(0, 300) };
  }
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}

async function downloadPdf(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Ozon did not return the PDF file.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 5).toString('utf8') !== '%PDF-') {
    throw new Error('Ozon did not return a PDF.');
  }
  return bytes;
}

export async function mergePdfs(buffers) {
  const files = buffers.filter((item) => item?.length);
  if (!files.length) throw new Error('Ozon returned an empty PDF.');
  if (files.length === 1) return files[0];
  const merged = await PDFDocument.create();
  for (const bytes of files) {
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return Buffer.from(await merged.save());
}

async function waitForLabel(account, taskId) {
  let last = 'Ozon is still preparing the shipping labels. Try again in a minute.';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt) await sleep(3000);
    const data = await ozonJson(account, '/v2/posting/fbs/package-label/get', { task_id: taskId });
    const url = data.file_url || data.result?.file_url || '';
    const status = data.status || data.result?.status || {};
    const code = String(status.code || '');
    const unprinted = Array.isArray(status.unprinted_postings) ? status.unprinted_postings : [];
    if (data.error?.message) last = String(data.error.message);
    if (url) {
      return {
        bytes: await downloadPdf(url),
        warnings: unprinted.map((row) => `${row.posting_number || 'A posting'}: ${row.message || 'label was not printed'}`),
      };
    }
    if (/fail|error|cancel/i.test(code)) {
      throw new Error(data.error?.message || last);
    }
    if (code) last = `Ozon label status: ${code}.`;
  }
  throw new Error(last);
}

async function fetchLabelPdfV2(account, numbers) {
  const response = await ozonPost(`${ROOT}/v2/posting/fbs/package-label`, { posting_number: numbers }, sellerHeaders(account), 60_000);
  const type = String(response.headers.get('content-type') || '');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.ok && bytes.subarray(0, 5).toString('utf8') === '%PDF-') {
    return { bytes, warnings: [] };
  }
  let data = {};
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch {
    data = { message: bytes.toString('utf8').slice(0, 300) };
  }
  const error = new Error(ozonErrorMessage(data, response.status));
  error.status = response.status;
  throw error;
}

export async function fetchShippingLabelPdf(account, postingNumbers) {
  const numbers = [...new Set(postingNumbers.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 20);
  if (!numbers.length) throw new Error('Select at least one order.');
  let created;
  try {
    created = await ozonJson(account, '/v3/posting/fbs/package-label/create', { posting_numbers: numbers });
  } catch (error) {
    try {
      return await fetchLabelPdfV2(account, numbers);
    } catch {
      if (/NO_POSTINGS_FOR_BATCH_DOWNLOAD/i.test(error.message || '')) {
        throw new Error('Ozon could not print shipping labels for these orders. Pack them first if they are still ready to pack, then try again.');
      }
      throw error;
    }
  }
  const tasks = created.tasks || created.result?.tasks || (created.result?.task_id ? [created.result] : []);
  if (!tasks.length) {
    return fetchLabelPdfV2(account, numbers);
  }
  const pdfs = [];
  const warnings = [];
  for (const task of tasks) {
    const taskId = task.task_id ?? task.taskId;
    if (taskId == null || taskId === '') continue;
    const file = await waitForLabel(account, taskId);
    pdfs.push(file.bytes);
    warnings.push(...file.warnings);
  }
  if (!pdfs.length) throw new Error('Ozon did not return a shipping-label task.');
  return { bytes: await mergePdfs(pdfs), warnings };
}

function collectProducts(node, posting, out, seen) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectProducts(item, posting, out, seen));
    return;
  }
  const nextPosting = node.posting_number || node.postingNumber || posting || '';
  const nested = node.products || node.items;
  if (Array.isArray(nested)) {
    collectProducts(nested, nextPosting, out, seen);
    return;
  }
  const name = node.name || node.title || node.product_name || '';
  const sku = node.offer_id || node.offerId || node.sku || '';
  const quantity = node.quantity ?? node.qty;
  if (!nextPosting || !name || sku === '' || sku == null || quantity == null) return;
  const key = `${nextPosting}|${sku}|${name}|${quantity}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    postingNumber: String(nextPosting),
    name: String(name),
    sku: String(sku),
    quantity: Number(quantity) || 1,
  });
}

export function productsFromAssembly(data) {
  const out = [];
  collectProducts(data, '', out, new Set());
  return out;
}

export async function fetchAssemblyProducts(account, postingNumbers) {
  const numbers = [...new Set(postingNumbers.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 1000);
  if (!numbers.length) return [];
  let data;
  try {
    data = await ozonJson(account, '/v1/assembly/fbs/product/list', { posting_number: numbers });
  } catch (error) {
    if (error.status && error.status !== 400) throw error;
    data = await ozonJson(account, '/v1/assembly/fbs/product/list', { posting_numbers: numbers });
  }
  return productsFromAssembly(data);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function labelCode(postingNumber) {
  const first = String(postingNumber || '').split('-')[0] || '';
  return first.slice(-4);
}

function guessImageType(bytes, url) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  if (/\.png(\?|$)/i.test(url)) return 'image/png';
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp';
  return 'image/jpeg';
}

async function asDataUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'image/*' },
    });
    if (!res.ok) return '';
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 24 || bytes.length > 3_000_000) return '';
    const ct = String(res.headers.get('content-type') || '').split(';')[0].trim();
    const type = ct.startsWith('image/') ? ct : guessImageType(bytes, url);
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return '';
  }
}

export function productListLines(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const posting = String(row.postingNumber || '').trim();
    if (!posting) return;
    if (!grouped.has(posting)) grouped.set(posting, []);
    grouped.get(posting).push(row);
  });
  const lines = [];
  let index = 0;
  for (const [posting, products] of grouped) {
    products.forEach((product, productIndex) => {
      index += 1;
      const code = productIndex === 0 ? ` ${labelCode(posting)}` : '';
      const qty = Math.max(1, Math.min(999, Number(product.quantity) || 1));
      lines.push(`${index} ${posting} ${String(product.name || '').replace(/\s+/g, ' ').trim()} ${String(product.sku || '').trim()} ${qty}${code}`);
    });
  }
  return lines;
}

export async function renderProductListPdf(rows, meta = {}) {
  if (!rows || !rows.length) throw new Error('The selected orders have no products to list.');

  const grouped = new Map();
  rows.forEach((row) => {
    const posting = String(row.postingNumber || '').trim();
    if (!posting) return;
    if (!grouped.has(posting)) grouped.set(posting, []);
    grouped.get(posting).push(row);
  });

  if (!grouped.size) throw new Error('The selected orders have no valid postings.');

  const rawItems = [];
  for (const [posting, products] of grouped) {
    products.forEach((product, productIndex) => {
      rawItems.push({
        postingNumber: posting,
        name: String(product.name || '').trim(),
        sku: String(product.sku || '').trim(),
        quantity: Math.max(1, Math.min(999, Number(product.quantity) || 1)),
        image: product.image || '',
        labelCode: productIndex === 0 ? labelCode(posting) : '',
        warehouse: product.warehouse || '',
        deliveryService: product.deliveryService || '',
      });
    });
  }

  // 1. Translate all product titles into English
  const namesToTranslate = rawItems.map((item) => item.name);
  let translatedNames = [];
  try {
    translatedNames = await translateBulk(namesToTranslate);
  } catch (err) {
    console.warn('[ProductListPdf] Translation failed, using original titles:', err.message);
    translatedNames = namesToTranslate;
  }

  // 2. Concurrently fetch and convert images to data URLs
  const uniqueImageUrls = [...new Set(rawItems.map((item) => item.image).filter((url) => url && /^https?:\/\//i.test(url)))];
  const imageMap = new Map();
  await Promise.all(
    uniqueImageUrls.map(async (url) => {
      const dataUrl = await asDataUrl(url);
      if (dataUrl) imageMap.set(url, dataUrl);
    })
  );

  const items = rawItems.map((item, idx) => ({
    ...item,
    translatedName: translatedNames[idx] || item.name,
    imageDataUrl: imageMap.get(item.image) || (item.image && item.image.startsWith('data:image/') ? item.image : ''),
  }));

  // 3. Metadata for header
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const formattedDate = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const shipmentCount = meta.shipmentQuantity || grouped.size;
  const warehouses = [...new Set(rows.map((row) => String(row.warehouse || '').trim()).filter(Boolean))];
  const warehouseText = warehouses.join(', ') || meta.warehouse || 'Mumbai Warehouse';
  const deliveryServices = [...new Set(rows.map((row) => String(row.deliveryService || '').trim()).filter(Boolean))];
  const deliveryServiceText = deliveryServices.join(', ') || meta.deliveryService || 'GBS & MyIndia Extra Small Express IN';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Product List</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #111827;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.4;
      background: #fff;
    }
    .header-section {
      margin-bottom: 12px;
      padding-bottom: 6px;
    }
    .header-top {
      display: flex;
      align-items: baseline;
      gap: 32px;
      margin-bottom: 4px;
    }
    .title-date, .title-qty {
      font-size: 15px;
      font-weight: 700;
      color: #000;
    }
    .notice-text {
      font-size: 11px;
      color: #374151;
      margin-bottom: 5px;
      line-height: 1.35;
    }
    .meta-line {
      font-size: 12px;
      color: #111827;
      margin-bottom: 2px;
    }
    .meta-line strong {
      font-weight: 600;
    }
    table.product-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
    }
    thead th {
      border-bottom: 2px solid #111827;
      padding: 6px 6px;
      font-size: 11px;
      font-weight: 600;
      color: #111827;
      text-align: left;
      vertical-align: bottom;
    }
    tbody td {
      border-bottom: 1px solid #e5e7eb;
      padding: 7px 6px;
      vertical-align: middle;
    }
    .col-num {
      width: 28px;
      text-align: center;
      font-size: 11px;
      color: #4b5563;
      font-weight: 500;
    }
    .col-shipment {
      width: 125px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 500;
      color: #111827;
      white-space: nowrap;
    }
    .col-img {
      width: 56px;
      text-align: center;
    }
    .prod-thumb {
      width: 46px;
      height: 46px;
      object-fit: contain;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
      background: #fafafa;
      display: inline-block;
      vertical-align: middle;
    }
    .no-img {
      width: 46px;
      height: 46px;
      border-radius: 4px;
      border: 1px dashed #d1d5db;
      background: #f9fafb;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
    }
    .col-prod {
      padding-right: 12px;
    }
    .prod-title {
      font-size: 11px;
      line-height: 1.35;
      color: #111827;
      font-weight: 400;
      word-break: break-word;
    }
    .col-sku {
      width: 120px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 600;
      color: #374151;
      white-space: nowrap;
    }
    .col-qty {
      width: 45px;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      color: #111827;
    }
    .col-label {
      width: 65px;
      text-align: center;
    }
    .label-code {
      font-size: 19px;
      font-weight: 700;
      color: #000;
      letter-spacing: 0.5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, sans-serif;
    }
  </style>
</head>
<body>
  <div class="header-section">
    <div class="header-top">
      <span class="title-date">Date: ${escapeHtml(formattedDate)}</span>
      <span class="title-qty">Shipment quantity: ${escapeHtml(shipmentCount)}</span>
    </div>
    <div class="notice-text">Check the list before the order acceptance is complete: until then, customers can place and cancel them.</div>
    <div class="meta-line">Warehouse: ${escapeHtml(warehouseText)}</div>
    <div class="meta-line">Delivery service: ${escapeHtml(deliveryServiceText)}</div>
  </div>

  <table class="product-table">
    <thead>
      <tr>
        <th style="text-align: center; width: 28px;">№</th>
        <th style="width: 125px;">Shipment number</th>
        <th style="text-align: center; width: 56px;">Image</th>
        <th>Product</th>
        <th style="width: 110px;">Article code</th>
        <th style="text-align: center; width: 45px;">Quantity</th>
        <th style="text-align: center; width: 65px;">Label</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, idx) => `
        <tr>
          <td class="col-num">${idx + 1}</td>
          <td class="col-shipment">${escapeHtml(item.postingNumber)}</td>
          <td class="col-img">
            ${item.imageDataUrl
              ? `<img src="${escapeHtml(item.imageDataUrl)}" class="prod-thumb" alt="Product" />`
              : `<div class="no-img"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`
            }
          </td>
          <td class="col-prod">
            <div class="prod-title">${escapeHtml(item.translatedName)}</div>
          </td>
          <td class="col-sku">${escapeHtml(item.sku || '—')}</td>
          <td class="col-qty">${escapeHtml(item.quantity)}</td>
          <td class="col-label">
            ${item.labelCode ? `<span class="label-code">${escapeHtml(item.labelCode)}</span>` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;

  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}
