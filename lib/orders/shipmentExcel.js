import ExcelJS from 'exceljs';

export const SHIPMENT_HEADERS = [
  'SHIPMENT NUMBER',
  "Customer's full name",
  'Delivery address',
  'Pick-up point code',
  'Delivery cluster',
  'PRODUCT',
  'PRICE (INR)',
  'Comment',
];

const COL_WIDTHS = [22, 25, 42, 18, 26, 56, 18, 18];
const FALLBACK_RATE = 84;
const PRICE_BRACKETS = [
  { min: 30, fee: 7.7 },
  { min: 25, fee: 6.6 },
  { min: 20, fee: 5.5 },
  { min: 15, fee: 4.4 },
  { min: 5, fee: 3.3 },
];
const DEFAULT_FEE_USD = 3.3;

export function amountOf(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value === 'object') {
    return amountOf(value.amount ?? value.value ?? value.price);
  }
  return null;
}

export function currencyOf(value, fallback = '') {
  if (!value || typeof value !== 'object') return fallback;
  return String(value.currency_code || value.currency || fallback || '').trim();
}

export function formatMoney(value, fallbackCurrency = '') {
  const amount = amountOf(value);
  if (amount == null) return '';
  const currency = currencyOf(value, fallbackCurrency);
  const shown = amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return currency ? `${shown} ${currency}` : shown;
}

function unitUsd(order, product, index) {
  const rows = order.financial_data?.products || [];
  const match = rows.find((row) => (
    row.product_id == product?.offer_id
    || row.product_id == product?.product_id
    || row.product_id == product?.sku
  )) || rows[index] || {};
  const fromFinancial = amountOf(match.price);
  if (fromFinancial != null) return fromFinancial;
  return amountOf(product?.price) || 0;
}

function bracketFeeUsd(totalUsd) {
  for (const bracket of PRICE_BRACKETS) {
    if (totalUsd >= bracket.min) return bracket.fee;
  }
  return DEFAULT_FEE_USD;
}

export function shipmentRow(order, usdToInr) {
  const addr = order.customer?.address ?? {};
  const products = Array.isArray(order.products) ? order.products : [];
  const productNames = products.map((product) => product?.name?.trim()).filter(Boolean).join(', ');
  const totalUsd = products.reduce((sum, product, index) => {
    const qty = parseInt(product?.quantity, 10) || 1;
    return sum + unitUsd(order, product, index) * qty;
  }, 0);
  const feeInr = Math.round(bracketFeeUsd(totalUsd) * usdToInr);

  return [
    order.posting_number ?? '',
    order.customer?.name?.trim() ?? '',
    addr.address_tail?.trim() ?? '',
    addr.pvz_code ? String(addr.pvz_code) : '',
    order.financial_data?.cluster_to?.trim() ?? '',
    productNames,
    feeInr,
    '',
  ];
}

export async function fetchUsdToInrRate() {
  const sources = [
    { url: 'https://latest.currency-api.pages.dev/v1/currencies/usd.json', parse: (data) => data?.usd?.inr },
    { url: 'https://api.exchangerate-api.com/v4/latest/USD', parse: (data) => data?.rates?.INR },
  ];
  for (const source of sources) {
    try {
      const response = await fetch(source.url);
      if (!response.ok) continue;
      const rate = source.parse(await response.json());
      if (rate) return rate;
    } catch {
      // Try the next public rate.
    }
  }
  return FALLBACK_RATE;
}

export async function buildShipmentWorkbook(orders, usdToInr) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ozon Fulfillment System';
  workbook.lastModifiedBy = 'Frostrek Logistics';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Shipment Manifest', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Freeze top header row so it stays pinned on scroll
  worksheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true },
  ];

  // Professional Header Row
  const headerRow = worksheet.addRow(SHIPMENT_HEADERS);
  headerRow.height = 32;

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10756F' }, // Deep Teal brand color
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber === 1 || colNumber === 4 ? 'center' : colNumber === 7 ? 'right' : 'left',
      wrapText: false,
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0C5D58' } },
      bottom: { style: 'medium', color: { argb: 'FF0C5D58' } },
      left: { style: 'thin', color: { argb: 'FF1B8A83' } },
      right: { style: 'thin', color: { argb: 'FF1B8A83' } },
    };
  });

  let totalFees = 0;

  // Add Data Rows with Zebra Striping & Polish
  orders.forEach((order, index) => {
    const rowData = shipmentRow(order, usdToInr);
    const row = worksheet.addRow(rowData);
    row.height = 26;

    const isEven = index % 2 === 1;
    const bgArgb = isEven ? 'FFF8FAFC' : 'FFFFFFFF'; // Clean alternating zebra row
    const feeValue = Number(rowData[6]) || 0;
    totalFees += feeValue;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        color: { argb: 'FF1E293B' },
        bold: colNumber === 1,
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgArgb },
      };

      // Cell Alignment & Wrap Rules
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 1 || colNumber === 4 ? 'center' : colNumber === 7 ? 'right' : 'left',
        wrapText: colNumber === 3 || colNumber === 6, // Wrap address and product names cleanly
      };

      // Currency Formatting on PRICE (INR)
      if (colNumber === 7 && typeof cell.value === 'number') {
        cell.numFmt = '"₹"#,##0';
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      }

      // Shipment number styling
      if (colNumber === 1) {
        cell.font = { name: 'Consolas', size: 10, bold: true, color: { argb: 'FF0C5D58' } };
      }

      // Subtle light border
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      };
    });
  });

  // Summary / Total Row at the bottom
  if (orders.length > 0) {
    const summaryRow = worksheet.addRow([
      `TOTAL: ${orders.length} ORDERS`,
      '',
      '',
      '',
      '',
      '',
      totalFees,
      '',
    ]);
    summaryRow.height = 30;

    summaryRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F5F4' }, // Soft teal tint
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10.5,
        bold: true,
        color: { argb: 'FF0C5D58' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 7 ? 'right' : 'left',
      };
      if (colNumber === 7) {
        cell.numFmt = '"₹"#,##0';
        cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF047857' } };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF10756F' } },
        bottom: { style: 'double', color: { argb: 'FF10756F' } }, // Classic accounting double line
      };
    });
  }

  // Set explicit professional column widths
  COL_WIDTHS.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  return workbook.xlsx.writeBuffer();
}
