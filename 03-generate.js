#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import path from "path";
import Handlebars from "handlebars";
import { PDFDocument } from "pdf-lib";
import { CONFIG } from "./config.js";

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
  if (typeof value === "string" && value.trim() && value.trim() !== "[object Object]") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    return String(value.currency || value.currency_code || fallback || "").trim();
  }
  return String(fallback || "").trim();
}

function formatMoney(value, fallbackCurrency) {
  const amount = amountOf(value);
  if (!amount) return "—";
  const currency = currencyOf(value, fallbackCurrency);
  return currency ? `${amount} ${currency}` : amount;
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
  const batchSize = 6;
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

function prepareOrder(order, imageCache) {
  const copy = structuredClone(order);
  alignFinancialProducts(copy);
  for (const product of copy.products || []) {
    product.currency_code = currencyOf(product.price, product.currency_code);
    const amount = amountOf(product.price);
    if (amount) product.price = amount;
    const url = productImageUrl(product);
    product.photo = (url && imageCache.get(url)) || "";
  }
  for (const row of copy.financial_data?.products || []) {
    row.customer_currency_code = currencyOf(row.customer_price, row.customer_currency_code || row.currency_code);
    const paid = amountOf(row.customer_price);
    if (paid) row.customer_price = paid;
  }
  return copy;
}

function registerHelpers() {
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
    const bytes = await Bun.file(filePath).arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  await Bun.write(outputPath, await merged.save());
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

  const inputBunFile = Bun.file(inputFile);
  if (!(await inputBunFile.exists())) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  const dataArray = await inputBunFile.json();
  registerHelpers();
  const template = Handlebars.compile(await Bun.file(templatePath).text());
  const imageCache = await imageCacheFor(dataArray);
  logger.info(`Embedded ${[...imageCache.values()].filter(Boolean).length}/${imageCache.size} product image(s) for the PDF.`);

  logger.info("🚀 Launching browser...");
  const browser = await launchChrome();
  const ok = [];

  try {
    const CONCURRENCY = process.env.RENDER ? 1 : 2;
    for (let i = 0; i < dataArray.length; i += CONCURRENCY) {
      const batch = dataArray.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (order) => {
        try {
          const prepared = prepareOrder(order, imageCache);
          const bytes = await htmlToPdf(browser, template(prepared));
          const filePath = path.join(outputDir, `${order.posting_number}.pdf`);
          await Bun.write(filePath, bytes);
          ok.push({ file: filePath });
          logger.debug(`✅ Generated PDF for ${order.posting_number}`);
        } catch (err) {
          logger.error(`❌ Failed PDF for ${order.posting_number}: ${err.message}`);
        }
      }));
    }
  } finally {
    await browser.close();
  }

  if (ok.length > 0) {
    const orderedPaths = dataArray
      .map((order) => ok.find((row) => path.basename(row.file) === `${order.posting_number}.pdf`))
      .filter(Boolean)
      .map((row) => row.file);
    await mergePdfs(orderedPaths, finalPdfPath);
    logger.info(`📄 Final PDF created: ${finalPdfPath}`);
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
  const concurrency = process.env.RENDER ? 1 : 3;

  try {
    for (let index = 0; index < list.length; index += concurrency) {
      const batch = list.slice(index, index + concurrency);
      const pages = await Promise.all(batch.map(async (order) => {
        const prepared = prepareOrder(order, imageCache);
        return htmlToPdf(browser, template(prepared));
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
