#!/usr/bin/env bun

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "path";
import Handlebars from "handlebars";
import { PDFDocument } from "pdf-lib";
import { CONFIG } from "./config.js";

const CURRENCY_SYMBOLS = {
  USD: "$",
  EUR: "€",
  RUB: "₽",
  GBP: "£",
  INR: "₹",
  CNY: "¥",
};

// Code 128B vector barcode patterns
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

function generateBarcodeSvg(text, height = 36) {
  if (!text) return "";
  const codes = [104];
  let checkSum = 104;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code >= 0 && code <= 95) {
      codes.push(code);
      checkSum += code * (i + 1);
    }
  }
  codes.push(checkSum % 103);
  codes.push(106);

  let pattern = "";
  for (const c of codes) {
    pattern += CODE128_PATTERNS[c] || "";
  }

  let svgPaths = "";
  let x = 0;
  for (let i = 0; i < pattern.length; i++) {
    const width = parseInt(pattern[i], 10);
    if (i % 2 === 0) {
      svgPaths += `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#0F172A"/>`;
    }
    x += width;
  }

  return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" style="height:${height}px;width:100%;max-width:210px;display:block;">${svgPaths}</svg>`;
}

function amountOf(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const text = value.trim();
    return text === "[object Object]" ? "" : text;
  }
  if (typeof value === "object") {
    return amountOf(value.amount ?? value.value ?? value.price);
  }
  return "";
}

function currencyOf(value, fallback = "") {
  if (typeof value === "string") {
    const text = value.trim();
    if (text && text !== "[object Object]" && !/^-?[\d,.]+$/.test(text)) {
      return text;
    }
  }
  if (value && typeof value === "object") {
    const cand = value.currency || value.currency_code || fallback || "";
    if (typeof cand === "string") {
      const text = cand.trim();
      if (text && text !== "[object Object]" && !/^-?[\d,.]+$/.test(text)) {
        return text;
      }
    }
  }
  const fb = String(fallback || "").trim();
  if (fb && !/^-?[\d,.]+$/.test(fb)) return fb;
  return "";
}

function formatMoney(value, fallbackCurrency) {
  const amount = amountOf(value);
  if (!amount) return "—";
  const num = parseFloat(amount.replace(/,/g, ""));
  const formattedNum = Number.isFinite(num)
    ? num.toLocaleString("en-US", { minimumFractionDigits: amount.includes(".") ? 2 : 0, maximumFractionDigits: 2 })
    : amount;

  const rawCurr = currencyOf(value, fallbackCurrency);
  const upper = rawCurr ? rawCurr.toUpperCase() : "";
  const symbol = CURRENCY_SYMBOLS[upper] || rawCurr;

  if (symbol === "$") return `$${formattedNum}`;
  if (symbol === "₽") return `${formattedNum} ₽`;
  if (symbol === "€" || symbol === "£" || symbol === "₹") return `${symbol}${formattedNum}`;
  return symbol ? `${formattedNum} ${symbol}` : formattedNum;
}

function firstHttpUrl(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const text = value.trim();
    if (/^https?:\/\//i.test(text) || text.startsWith("data:image/")) return text;
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstHttpUrl(item);
      if (url) return url;
    }
    return "";
  }
  if (typeof value === "object") {
    return firstHttpUrl(value.url || value.src || value.href || value.file_name);
  }
  return "";
}

function productImageUrl(product) {
  return firstHttpUrl(
    product?.photo
    || product?.primary_image
    || product?.image
    || product?.images
    || product?.picture,
  );
}

function guessImageType(bytes, url) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  return "image/jpeg";
}

async function asDataUrl(url) {
  if (!url) return "";
  if (url.startsWith("data:image/")) return url;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
    });
    if (!response.ok) return "";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 24 || bytes.length > 2_500_000) return "";
    const headerType = String(response.headers.get("content-type") || "").split(";")[0].trim();
    const type = headerType.startsWith("image/") ? headerType : guessImageType(bytes, url);
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}

async function imageCacheFor(orders) {
  const urls = new Set();
  for (const order of orders) {
    for (const product of order?.products || []) {
      const url = productImageUrl(product);
      if (url) urls.add(url);
    }
  }
  const cache = new Map();
  const list = [...urls];
  const batchSize = 12; // Boosted parallel image fetching
  for (let index = 0; index < list.length; index += batchSize) {
    const batch = list.slice(index, index + batchSize);
    await Promise.all(batch.map(async (url) => {
      cache.set(url, await asDataUrl(url));
    }));
  }
  return cache;
}

function alignFinancialProducts(order) {
  if (!order.financial_data?.products || !order.products) return;
  const byId = {};
  for (const row of order.financial_data.products) {
    byId[row.product_id] = row;
  }
  order.financial_data.products = order.products
    .map((product) => {
      const row = byId[product.sku] || byId[product.product_id];
      return row ? { ...row, product_id: product.product_id } : null;
    })
    .filter(Boolean);
}

export function prepareOrder(order, imageCache) {
  const copy = structuredClone(order);
  alignFinancialProducts(copy);
  for (const product of copy.products || []) {
    const curr = currencyOf(product.price, product.currency_code);
    if (curr) product.currency_code = curr;
    const amount = amountOf(product.price);
    if (amount) product.price = amount;
    const url = productImageUrl(product);
    product.photo = (url && imageCache.get(url)) || "";
  }
  for (const row of copy.financial_data?.products || []) {
    const curr = currencyOf(row.customer_price, row.customer_currency_code || row.currency_code);
    if (curr) row.customer_currency_code = curr;
    const paid = amountOf(row.customer_price);
    if (paid) row.customer_price = paid;
  }
  return copy;
}

export function registerHelpers() {
  Handlebars.registerHelper("asOrderList", (context) => {
    if (context && Array.isArray(context.orders)) return context.orders;
    if (Array.isArray(context)) return context;
    if (context && typeof context === "object" && context.posting_number) return [context];
    return [];
  });
  Handlebars.registerHelper("formatDate", (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    if (isNaN(date)) return "-";
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const mo = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
    const yyyy = date.getUTCFullYear();
    return `${dd} ${mo} ${yyyy}`;
  });
  Handlebars.registerHelper("formatWeight", (weight, unit) => {
    if (weight == null) return "-";
    const kg = unit === "g" ? weight / 1000 : weight;
    return kg.toFixed(3) + " kg";
  });
  Handlebars.registerHelper("formatDimensions", (dimensions) => {
    if (!dimensions) return "—";
    const w = dimensions.width ?? 0;
    const d = dimensions.depth ?? 0;
    const h = dimensions.height ?? 0;
    if (!w && !d && !h) return "—";
    return `${w} × ${d} × ${h} mm`;
  });
  Handlebars.registerHelper("barcodeSvg", (text) => {
    return new Handlebars.SafeString(generateBarcodeSvg(String(text || ""), 34));
  });
  Handlebars.registerHelper("formatMoney", (value, fallbackCurrency) => (
    formatMoney(value, typeof fallbackCurrency === "string" ? fallbackCurrency : "")
  ));
  Handlebars.registerHelper("findById", (arr, id) => (
    Array.isArray(arr) ? arr.find((item) => item.product_id === id) : undefined
  ));
  Handlebars.registerHelper("totalWeight", (products) => {
    if (!Array.isArray(products)) return "-";
    const kg = products.reduce((sum, product) => {
      const weight = product.dimensions?.weight || 0;
      const unit = product.dimensions?.weight_unit;
      return sum + (unit === "g" ? weight / 1000 : weight);
    }, 0);
    return kg.toFixed(3) + " kg";
  });
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("gt", (a, b) => a > b);
}

async function mergePdfs(pdfPaths, outputPath) {
  const merged = await PDFDocument.create();
  for (const filePath of pdfPaths) {
    const bytes = await readFile(filePath);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  await writeFile(outputPath, Buffer.from(await merged.save()));
}

async function launchChrome() {
  const { launchPdfBrowser } = await import("./lib/ozon/pdfBrowser.js");
  return launchPdfBrowser();
}

async function htmlToPdf(browser, html) {
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(20000);
    page.setDefaultTimeout(20000);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const type = request.resourceType();
      const url = request.url();
      if ((type === "image" || type === "media") && /^https?:/i.test(url)) {
        return request.abort();
      }
      return request.continue();
    });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
  } finally {
    await page.close();
  }
}

export async function generatePdfs(runDir, logger) {
  const inputFile = path.join(runDir, CONFIG.filenames.translated);
  const outputDir = path.join(runDir, CONFIG.filenames.renderDir);
  const finalPdfPath = path.join(runDir, CONFIG.filenames.finalPdf);
  const templatePath = path.join(process.cwd(), "template.html");

  await mkdir(outputDir, { recursive: true });

  let dataArray;
  try {
    const rawContent = await readFile(inputFile, "utf8");
    dataArray = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`Input file not found or invalid: ${inputFile} (${err.message})`);
  }

  registerHelpers();
  const template = Handlebars.compile(await readFile(templatePath, "utf8"));
  const imageCache = await imageCacheFor(dataArray);
  logger.info(`Embedded ${[...imageCache.values()].filter(Boolean).length}/${imageCache.size} product image(s) for the PDF.`);

  logger.info("🚀 Launching browser...");
  const browser = await launchChrome();
  const ok = [];

  try {
    const CONCURRENCY = process.env.RENDER ? 1 : 4; // Boosted PDF rendering concurrency
    for (let i = 0; i < dataArray.length; i += CONCURRENCY) {
      const batch = dataArray.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (order) => {
        try {
          const prepared = prepareOrder(order, imageCache);
          const bytes = await htmlToPdf(browser, template({ orders: [prepared] }));
          const filePath = path.join(outputDir, `${order.posting_number}.pdf`);
          await writeFile(filePath, Buffer.from(bytes));
          ok.push({ file: filePath });
          if (typeof logger.debug === "function") {
            logger.debug(`✅ Generated PDF for ${order.posting_number}`);
          }
        } catch (err) {
          logger.error(`❌ Failed PDF for ${order.posting_number}: ${err.message}`);
        }
      }));
    }

    // Generate 2 orders/products per A4 sheet for final.pdf to eliminate blank whitespace
    if (ok.length > 0) {
      const pairs = [];
      for (let i = 0; i < dataArray.length; i += 2) {
        pairs.push(dataArray.slice(i, i + 2));
      }

      const merged = await PDFDocument.create();
      for (let i = 0; i < pairs.length; i += CONCURRENCY) {
        const batch = pairs.slice(i, i + CONCURRENCY);
        const pages = await Promise.all(batch.map(async (pair) => {
          const preparedList = pair.map((order) => prepareOrder(order, imageCache));
          return htmlToPdf(browser, template({ orders: preparedList }));
        }));
        for (const bytes of pages) {
          const doc = await PDFDocument.load(bytes);
          const copied = await merged.copyPages(doc, doc.getPageIndices());
          copied.forEach((page) => merged.addPage(page));
        }
      }
      await writeFile(finalPdfPath, Buffer.from(await merged.save()));
      logger.info(`📄 Final PDF created (2 items/page): ${finalPdfPath}`);
    }
  } finally {
    await browser.close();
  }

  logger.info(`⚡ Done — ${ok.length}/${dataArray.length} PDFs generated.`);
}

export async function renderOrdersToPdf(orders) {
  const list = Array.isArray(orders) ? orders.filter((order) => order?.posting_number) : [];
  if (!list.length) throw new Error("Select at least one order.");

  registerHelpers();
  const template = Handlebars.compile(await readFile(path.join(process.cwd(), "template.html"), "utf8"));
  const imageCache = await imageCacheFor(list);
  const browser = await launchChrome();
  const merged = await PDFDocument.create();
  const concurrency = process.env.RENDER ? 1 : 4;

  const pairs = [];
  for (let i = 0; i < list.length; i += 2) {
    pairs.push(list.slice(i, i + 2));
  }

  try {
    for (let index = 0; index < pairs.length; index += concurrency) {
      const batch = pairs.slice(index, index + concurrency);
      const pages = await Promise.all(batch.map(async (pair) => {
        const preparedList = pair.map((order) => prepareOrder(order, imageCache));
        return htmlToPdf(browser, template({ orders: preparedList }));
      }));
      for (const bytes of pages) {
        const doc = await PDFDocument.load(bytes);
        const copied = await merged.copyPages(doc, doc.getPageIndices());
        copied.forEach((page) => merged.addPage(page));
      }
    }
  } finally {
    await browser.close();
  }

  return Buffer.from(await merged.save());
}
