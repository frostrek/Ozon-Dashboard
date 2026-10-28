import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { ozonPost } from '../../ozon-http.js';
import { ozonErrorMessage, sellerHeaders } from './sellerClient';

const ROOT = 'https://api-seller.ozon.ru';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function systemChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  return candidates.find((file) => existsSync(file)) || '';
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

export async function fetchShippingLabelPdf(account, postingNumbers) {
  const numbers = [...new Set(postingNumbers.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 1000);
  if (!numbers.length) throw new Error('Select at least one order.');
  let created;
  try {
    created = await ozonJson(account, '/v3/posting/fbs/package-label/create', { posting_numbers: numbers });
  } catch (error) {
    if (/NO_POSTINGS_FOR_BATCH_DOWNLOAD/i.test(error.message || '')) {
      throw new Error('Ozon only prints shipping labels for orders that are waiting for pickup. None of these orders are in that status yet.');
    }
    throw error;
  }
  const tasks = created.tasks || created.result?.tasks || (created.result?.task_id ? [created.result] : []);
  if (!tasks.length) throw new Error('Ozon did not start a shipping-label file for the selected orders.');
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
  const lines = productListLines(rows);
  if (!lines.length) throw new Error('The selected orders have no products to list.');
  const warehouses = [...new Set(rows.map((row) => String(row.warehouse || '').trim()).filter(Boolean))];
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 28px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { margin: 0 0 6px; font-size: 12px; }
    .line { font-size: 11px; line-height: 1.45; margin: 0 0 4px; }
  </style>
</head>
<body>
  <h1>Product list</h1>
  <p>Date: ${escapeHtml(today)}</p>
  <p>Warehouse: ${escapeHtml(warehouses.join(', ') || meta.warehouse || '—')}</p>
  <p>№ Shipment number</p>
  ${lines.map((line) => `<p class="line">${escapeHtml(line)}</p>`).join('')}
</body>
</html>`;

  if (String(process.env.PUPPETEER_CACHE_DIR || '').includes('cursor-sandbox-cache')) {
    delete process.env.PUPPETEER_CACHE_DIR;
  }
  const executablePath = systemChromePath();
  if (!executablePath) throw new Error('Google Chrome was not found, so the product list PDF could not be created.');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const bytes = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}
