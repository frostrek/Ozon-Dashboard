#!/usr/bin/env bun

import path from 'path';
import ExcelJS from 'exceljs';
import { CONFIG } from "./config.js";

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

  const HEADERS = ["SHIPMENT NUMBER", "Customer's full name", "Delivery address", "Pick-up point code", "Delivery cluster", "PRODUCT", "PRICE (INR)", "Comment"];
  const COL_WIDTHS = [28, 28, 60, 20, 28, 55, 14, 20];
  const FALLBACK_RATE = 84;
  const PRICE_BRACKETS = [{ min: 30, fee: 7.7 }, { min: 25, fee: 6.6 }, { min: 20, fee: 5.5 }, { min: 15, fee: 4.4 }, { min: 5, fee: 3.3 }];
  const DEFAULT_FEE_USD = 3.3;

  function getBracketFeeUsd(totalUsd) {
    for (const bracket of PRICE_BRACKETS) {
      if (totalUsd >= bracket.min) return bracket.fee;
    }
    return DEFAULT_FEE_USD;
  }

  async function fetchUsdToInrRate() {
    const sources = [
      { name: 'fawazahmed0/currency-api', url: 'https://latest.currency-api.pages.dev/v1/currencies/usd.json', parse: d => d?.usd?.inr },
      { name: 'exchangerate-api.com', url: 'https://api.exchangerate-api.com/v4/latest/USD', parse: d => d?.rates?.INR },
    ];
    for (const source of sources) {
      try {
        const res = await fetch(source.url);
        if (!res.ok) continue;
        const rate = source.parse(await res.json());
        if (rate) {
          logger.info(`💱 USD→INR rate: ${rate} (via ${source.name})`);
          return rate;
        }
      } catch (e) {
        logger.warn(`⚠️ ${source.name} failed: ${e.message}.`);
      }
    }
    logger.warn(`⚠️ All rate sources failed. Using fallback: ${FALLBACK_RATE}`);
    return FALLBACK_RATE;
  }

  function mapOrder(order, usdToInr) {
    const addr = order.customer?.address ?? {};
    const products = Array.isArray(order.products) ? order.products : [];
    const productNames = products.map(p => p?.name?.trim()).filter(Boolean).join(', ');

    const totalUsd = products.reduce((sum, p) => sum + (parseFloat(p?.price) || 0) * (parseInt(p?.quantity) ?? 1), 0);
    const feeUsd = getBracketFeeUsd(totalUsd);
    const feeInr = Math.round(feeUsd * usdToInr);

    return [
      order.posting_number ?? '',
      order.customer?.name?.trim() ?? '',
      addr.address_tail?.trim() ?? '',
      addr.pvz_code ? String(addr.pvz_code) : '',
      order.financial_data?.cluster_to?.trim() ?? '',
      productNames,
      feeInr,
      '', // Comment is left empty by design
    ];
  }

  const inputBunFile = Bun.file(inputFile);
  if (!(await inputBunFile.exists())) throw new Error(`Input file not found: ${inputFile}`);
  const orders = await inputBunFile.json();

  const usdToInr = await fetchUsdToInrRate();
  const rows = orders.map(order => mapOrder(order, usdToInr));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');
  const headerRow = worksheet.addRow(HEADERS);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD965' } };
  });

  for (const rowData of rows) {
    const row = worksheet.addRow(rowData);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', size: 11 };
      cell.alignment = { vertical: 'top' };
    });
  }

  COL_WIDTHS.forEach((w, i) => { worksheet.getColumn(i + 1).width = w; });
  await workbook.xlsx.writeFile(outputFile);
  logger.info(`✅ Excel report saved with ${rows.length} rows to ${outputFile}`);
  return { rate: usdToInr };
}