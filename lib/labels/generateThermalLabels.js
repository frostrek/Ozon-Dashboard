import fs from 'fs';
import path from 'path';
import { readPdf, readPdfPages } from './pdf/read.js';
import { extractTrackingIds } from './parser/extractTracking.js';
import { extractProductDetails } from './parser/productDetails.js';
import { translateBulk } from './utils/translate.js';
import { createThermalPDFWithDetails } from './pdf/generate.js';

export async function generateThermalLabels({ labelPdfPath, productPdfPath, outputPath }) {
  if (!labelPdfPath || !fs.existsSync(labelPdfPath)) {
    throw new Error('Shipping label PDF was not found.');
  }
  if (!outputPath) {
    throw new Error('Output path is required.');
  }

  const productMap = {};

  if (productPdfPath && fs.existsSync(productPdfPath)) {
    const productRawText = await readPdf(productPdfPath);
    const parsed = extractProductDetails(productRawText);
    Object.assign(productMap, parsed);

    const allTitles = [];
    const mappings = [];
    for (const id in productMap) {
      for (const prod of productMap[id]) {
        allTitles.push(prod.title);
        mappings.push(prod);
      }
    }

    const translatedTitles = await translateBulk(allTitles);
    for (let i = 0; i < translatedTitles.length; i++) {
      mappings[i].title = translatedTitles[i];
    }
  }

  const labelPagesText = await readPdfPages(labelPdfPath);
  const pagesData = [];
  let lastShipmentId = null;

  for (let i = 0; i < labelPagesText.length; i++) {
    const ids = extractTrackingIds(labelPagesText[i]);
    let shipmentId = null;
    if (ids.length > 0) {
      shipmentId = ids[0];
    } else if (lastShipmentId) {
      shipmentId = lastShipmentId;
    }

    if (!shipmentId) continue;
    lastShipmentId = shipmentId;
    const products = Array.isArray(productMap[shipmentId]) && productMap[shipmentId].length > 0
      ? productMap[shipmentId]
      : [{ title: 'Unknown Title', sku: 'N/A', qty: '1' }];

    pagesData.push({ pageIndex: i, shipmentId, products });
  }

  if (pagesData.length === 0) {
    throw new Error('No Ozon shipment numbers were found in the shipping label PDF.');
  }

  const originalLabelBytes = fs.readFileSync(labelPdfPath);
  await createThermalPDFWithDetails(originalLabelBytes, pagesData, outputPath);

  return {
    labelCount: pagesData.length,
    outputPath,
    filename: path.basename(outputPath),
  };
}
