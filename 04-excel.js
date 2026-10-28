#!/usr/bin/env bun

import path from 'path';
import { CONFIG } from "./config.js";
import { buildShipmentWorkbook, fetchUsdToInrRate, shipmentRow } from './lib/orders/shipmentExcel.js';

/**
 * json-to-xlsx.js
 * Converts Ozon orders JSON to xlsx matching the Frostrek LLP sheet structure.
 *
 * Column mapping:
 *   SHIPMENT NUMBER    <- posting_number
 *   Customer's name    <- customer.name
 *   Delivery address   <- customer.address.address_tail
 *   Pick-up point code <- customer.address.pvz_code (0 or falsy = blank)
 *   Delivery cluster   <- financial_data.cluster_to
 *   PRODUCT            <- products.name (joined)
 *   PRICE (INR)        <- Calculated based on order total (USD)
 * Price Decision Logic (Frostrek Bracket):
 *   Total USD >= 30: $7.70
 *   Total USD >= 25: $6.60
 *   Total USD >= 20: $5.50
 *   Total USD >= 15: $4.40
 *   Total USD >= 05: $3.30 (Default)
 *   Else: $3.30
 *
 * These USD prices are then converted to INR using live exchange rates.
 * 
 * Note: The "Comment" column is intentionally left empty for manual company use.
 */
export async function exportToExcel(runDir, logger) {
  const inputFile = path.join(runDir, CONFIG.filenames.translated);
  const outputFile = path.join(runDir, CONFIG.filenames.excel);

  const inputBunFile = Bun.file(inputFile);
  if (!(await inputBunFile.exists())) throw new Error(`Input file not found: ${inputFile}`);
  const orders = await inputBunFile.json();

  const usdToInr = await fetchUsdToInrRate();
  logger.info(`💱 USD→INR rate: ${usdToInr}`);
  const rows = orders.map(order => shipmentRow(order, usdToInr));
  const buffer = await buildShipmentWorkbook(orders, usdToInr);
  await Bun.write(outputFile, buffer);
  logger.info(`✅ Excel report saved with ${rows.length} rows to ${outputFile}`);
  return { rate: usdToInr };
}