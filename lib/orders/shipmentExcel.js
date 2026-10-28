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

const COL_WIDTHS = [28, 28, 60, 20, 28, 55, 14, 20];
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
  const worksheet = workbook.addWorksheet('Sheet1');
  const headerRow = worksheet.addRow(SHIPMENT_HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD965' } };
  });

  for (const order of orders) {
    const row = worksheet.addRow(shipmentRow(order, usdToInr));
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', size: 11 };
      cell.alignment = { vertical: 'top' };
    });
  }

  COL_WIDTHS.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  return workbook.xlsx.writeBuffer();
}
