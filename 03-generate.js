#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import path from "path";
import Handlebars from "handlebars";
import { PDFDocument } from "pdf-lib";
import { CONFIG } from "./config.js";

export async function generatePdfs(runDir, logger) {
  const inputFile = path.join(runDir, CONFIG.filenames.translated);
  const outputDir = path.join(runDir, CONFIG.filenames.renderDir);
  const finalPdfPath = path.join(runDir, CONFIG.filenames.finalPdf);
  const templatePath = path.join(process.cwd(), "template.html");

  await mkdir(outputDir, { recursive: true });

  function registerHelpers() {
    Handlebars.registerHelper("formatDate", (isoString) => {
      if (!isoString) return "-";
      const d = new Date(isoString);
      if (isNaN(d)) return "-";
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mo = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
      const yyyy = d.getUTCFullYear();
      return `${dd} ${mo} ${yyyy}`;
    });

    Handlebars.registerHelper("formatWeight", (weight, unit) => {
      if (weight == null) return "-";
      const kg = unit === "g" ? weight / 1000 : weight;
      return kg.toFixed(3) + " kg";
    });

    Handlebars.registerHelper("findById", function (arr, id) {
      return Array.isArray(arr)
        ? arr.find((x) => x.product_id === id)
        : undefined;
    });

    Handlebars.registerHelper("totalWeight", (products) => {
      if (!Array.isArray(products)) return "-";
      const kg = products.reduce((sum, p) => {
        const w = p.dimensions?.weight || 0;
        const unit = p.dimensions?.weight_unit;
        return sum + (unit === "g" ? w / 1000 : w);
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
      pages.forEach((p) => merged.addPage(p));
    }

    const mergedBytes = await merged.save();
    await Bun.write(outputPath, mergedBytes);
  }

  async function renderOrder(browser, template, order) {
    if (order.financial_data?.products && order.products) {
      const skuToFinancial = {};

      for (const fp of order.financial_data.products) {
        skuToFinancial[fp.product_id] = fp;
      }

      order.financial_data.products = order.products
        .map((p) => {
          const fin = skuToFinancial[p.sku];
          if (fin) return { ...fin, product_id: p.product_id };
          return null;
        })
        .filter(Boolean);
    }

    const html = template(order);
    const page = await browser.newPage();

    try {
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(30000);

      await page.setContent(html, { waitUntil: "load" });

      await page.evaluate(() =>
        Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
                }),
            ),
        ),
      );

      const filePath = path.join(outputDir, `${order.posting_number}.pdf`);

      await page.pdf({
        path: filePath,
        format: "A4",
        printBackground: true,
        margin: {
          top: "10mm",
          bottom: "10mm",
          left: "10mm",
          right: "10mm",
        },
      });

      return { ok: true, file: filePath };
    } finally {
      await page.close();
    }
  }

  const inputBunFile = Bun.file(inputFile);
  if (!(await inputBunFile.exists())) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  const dataArray = await inputBunFile.json();

  const templateSource = await Bun.file(templatePath).text();
  registerHelpers();
  const template = Handlebars.compile(templateSource);

  logger.info("🚀 Launching browser...");

  const browser = await launchChrome();

  const ok = [];

  try {
    const CONCURRENCY = 5;

    for (let i = 0; i < dataArray.length; i += CONCURRENCY) {
      const batch = dataArray.slice(i, i + CONCURRENCY);

      await Promise.all(
        batch.map(async (order) => {
          try {
            const result = await renderOrder(browser, template, order);
            ok.push(result);
            logger.debug(`✅ Generated PDF for ${order.posting_number}`);
          } catch (err) {
            logger.error(
              `❌ Failed PDF for ${order.posting_number}: ${err.message}`,
            );
          }
        }),
      );
    }
  } finally {
    await browser.close();
  }

  if (ok.length > 0) {
    const orderedPaths = dataArray
      .map((order) =>
        ok.find((r) => path.basename(r.file) === `${order.posting_number}.pdf`),
      )
      .filter(Boolean)
      .map((r) => r.file);

    await mergePdfs(orderedPaths, finalPdfPath);
    logger.info(`📄 Final PDF created: ${finalPdfPath}`);
  }

  logger.info(`⚡ Done — ${ok.length}/${dataArray.length} PDFs generated.`);
}

async function launchChrome() {
  const { launchPdfBrowser } = await import("./lib/ozon/pdfBrowser.js");
  return launchPdfBrowser();
}

function registerPdfHelpers() {
  Handlebars.registerHelper("formatDate", (isoString) => {
    if (!isoString) return "-";
    const d = new Date(isoString);
    if (isNaN(d)) return "-";
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mo = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
    const yyyy = d.getUTCFullYear();
    return `${dd} ${mo} ${yyyy}`;
  });
  Handlebars.registerHelper("formatWeight", (weight, unit) => {
    if (weight == null) return "-";
    const kg = unit === "g" ? weight / 1000 : weight;
    return kg.toFixed(3) + " kg";
  });
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

export async function renderOrdersToPdf(orders) {
  const list = Array.isArray(orders) ? orders.filter((order) => order?.posting_number) : [];
  if (!list.length) throw new Error("Select at least one order.");

  registerPdfHelpers();
  const template = Handlebars.compile(await readFile(path.join(process.cwd(), "template.html"), "utf8"));
  const browser = await launchChrome();
  const merged = await PDFDocument.create();
  const concurrency = 3;

  try {
    for (let index = 0; index < list.length; index += concurrency) {
      const batch = list.slice(index, index + concurrency);
      const pages = await Promise.all(batch.map(async (order) => {
        const copy = structuredClone(order);
        if (copy.financial_data?.products && copy.products) {
          const bySku = {};
          for (const row of copy.financial_data.products) bySku[row.product_id] = row;
          copy.financial_data.products = copy.products
            .map((product) => {
              const row = bySku[product.sku];
              return row ? { ...row, product_id: product.product_id } : null;
            })
            .filter(Boolean);
        }
        const page = await browser.newPage();
        try {
          page.setDefaultTimeout(30000);
          await page.setContent(template(copy), { waitUntil: "load" });
          return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
          });
        } finally {
          await page.close();
        }
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
