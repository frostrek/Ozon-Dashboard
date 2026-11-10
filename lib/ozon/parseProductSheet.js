import ExcelJS from 'exceljs';

const HEADER_ALIASES = {
  sku: 'offer_id',
  offerid: 'offer_id',
  vendor_code: 'offer_id',
  title: 'name',
  product_name: 'name',
  oldprice: 'old_price',
  category_id: 'description_category_id',
  categoryid: 'description_category_id',
  typeid: 'type_id',
  image: 'images',
  image_urls: 'images',
  image_url: 'images',
  quantity: 'stock',
  warehouse: 'warehouse_id',
};

export const TEMPLATE_HEADERS = [
  'offer_id',
  'name',
  'description',
  'description_attribute_id',
  'price',
  'old_price',
  'currency',
  'vat',
  'description_category_id',
  'type_id',
  'images',
  'brand',
  'color',
  'color_attribute_id',
  'size',
  'size_attribute_id',
  'material',
  'material_attribute_id',
  'barcode',
  'weight',
  'depth',
  'width',
  'height',
  'stock',
  'warehouse_id',
];

function headerName(value) {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  return HEADER_ALIASES[key] || key;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => String(value).trim()));
}

function recordsFromRows(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(headerName);
  return rows.slice(1).map((line, index) => {
    const record = { __row: index + 2 };
    headers.forEach((header, column) => {
      if (header) record[header] = String(line[column] ?? '').trim();
    });
    return record;
  }).filter((record) => TEMPLATE_HEADERS.some((header) => record[header]));
}

export function sheetToProducts(records) {
  return records.map((record) => {
    const images = String(record.images || '').split(/[\s|]+/).map((item) => item.trim()).filter(Boolean);
    const stock = record.stock === '' || record.stock == null ? null : Number(record.stock);
    return {
      row: record.__row,
      sku: String(record.offer_id || '').trim(),
      name: String(record.name || '').trim(),
      brand: String(record.brand || '').trim(),
      price: record.price === '' || record.price == null ? null : Number(record.price),
      old_price: record.old_price === '' || record.old_price == null ? null : Number(record.old_price),
      currency: String(record.currency || '').trim() || 'RUB',
      stock: Number.isFinite(stock) ? stock : null,
      images_json: JSON.stringify(images),
      attributes_json: JSON.stringify({
        description: record.description || '',
        description_attribute_id: record.description_attribute_id || '',
        description_category_id: record.description_category_id || '',
        type_id: record.type_id || '',
        vat: record.vat || '',
        color: record.color || '',
        color_attribute_id: record.color_attribute_id || '',
        size: record.size || '',
        size_attribute_id: record.size_attribute_id || '',
        material: record.material || '',
        material_attribute_id: record.material_attribute_id || '',
        barcode: record.barcode || '',
        weight: record.weight || '',
        depth: record.depth || '',
        width: record.width || '',
        height: record.height || '',
        weight_unit: 'g',
        dimension_unit: 'mm',
        warehouse_id: record.warehouse_id || '',
      }),
    };
  });
}

export function parseCsvProducts(text) {
  return sheetToProducts(recordsFromRows(parseCsv(text)));
}

export async function parseXlsxProducts(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows = [];
  sheet.eachRow((row) => {
    rows.push(row.values.slice(1).map((value) => (value == null ? '' : String(value))));
  });
  return sheetToProducts(recordsFromRows(rows));
}

export function templateCsv() {
  return `${TEMPLATE_HEADERS.join(',')}\n`;
}


export async function buildProductTemplateWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ozon Fulfillment Dashboard';
  wb.created = new Date();

  // Sheet 1: Products Template
  const ws = wb.addWorksheet('Products Template', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'offer_id *', key: 'offer_id', width: 18 },
    { header: 'name *', key: 'name', width: 38 },
    { header: 'price *', key: 'price', width: 14 },
    { header: 'old_price', key: 'old_price', width: 14 },
    { header: 'currency', key: 'currency', width: 12 },
    { header: 'stock *', key: 'stock', width: 12 },
    { header: 'brand', key: 'brand', width: 18 },
    { header: 'barcode', key: 'barcode', width: 18 },
    { header: 'weight (g) *', key: 'weight', width: 15 },
    { header: 'depth (mm) *', key: 'depth', width: 15 },
    { header: 'width (mm) *', key: 'width', width: 15 },
    { header: 'height (mm) *', key: 'height', width: 15 },
    { header: 'images (URLs)', key: 'images', width: 32 },
    { header: 'color', key: 'color', width: 14 },
    { header: 'size', key: 'size', width: 14 },
    { header: 'vat', key: 'vat', width: 10 },
    { header: 'description', key: 'description', width: 38 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10756F' },
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const sampleRows = [
    {
      offer_id: 'HIM-TAB-60S',
      name: 'Himalaya Herbal Health Tablets 60s',
      price: 18.5,
      old_price: 24.0,
      currency: 'USD',
      stock: 100,
      brand: 'Himalaya',
      barcode: '8901088012345',
      weight: 150,
      depth: 50,
      width: 50,
      height: 100,
      images: 'https://example.com/himalaya-sample.jpg',
      color: 'Green',
      size: '60 tabs',
      vat: '0%',
      description: 'Daily herbal dietary wellness tablets.',
    },
    {
      offer_id: 'PAT-DNT-100G',
      name: 'Patanjali Dant Kanti Toothpaste 100g',
      price: 8.99,
      old_price: 12.0,
      currency: 'USD',
      stock: 50,
      brand: 'Patanjali',
      barcode: '8901088098765',
      weight: 120,
      depth: 40,
      width: 40,
      height: 180,
      images: 'https://example.com/patanjali-sample.jpg',
      color: 'White',
      size: '100g',
      vat: '0%',
      description: 'Herbal ayurvedic toothpaste for dental care.',
    },
  ];

  sampleRows.forEach((item) => {
    const r = ws.addRow(item);
    r.height = 22;
    r.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle' };
    });
  });

  // Sheet 2: Field Guide & Instructions
  const guideWs = wb.addWorksheet('Field Guide & Instructions');
  guideWs.columns = [
    { header: 'Column Name', key: 'col', width: 22 },
    { header: 'Required?', key: 'req', width: 15 },
    { header: 'Format / Unit', key: 'fmt', width: 22 },
    { header: 'Description / Instructions', key: 'desc', width: 50 },
  ];

  const guideHeader = guideWs.getRow(1);
  guideHeader.height = 26;
  guideHeader.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle' };
  });

  const guideData = [
    { col: 'offer_id', req: 'REQUIRED', fmt: 'Text (alphanumeric)', desc: 'Your unique product SKU or article code.' },
    { col: 'name', req: 'REQUIRED', fmt: 'Text', desc: 'Product title displayed to buyers on Ozon.' },
    { col: 'price', req: 'REQUIRED', fmt: 'Number (e.g. 15.50)', desc: 'Current selling price.' },
    { col: 'old_price', req: 'Optional', fmt: 'Number (e.g. 20.00)', desc: 'Strikethrough reference price.' },
    { col: 'currency', req: 'Optional', fmt: 'USD / RUB / INR', desc: 'Currency code (defaults to USD).' },
    { col: 'stock', req: 'REQUIRED', fmt: 'Integer', desc: 'Quantity available in stock.' },
    { col: 'weight', req: 'REQUIRED', fmt: 'Grams (g)', desc: 'Packaged product weight in grams.' },
    { col: 'depth', req: 'REQUIRED', fmt: 'Millimeters (mm)', desc: 'Package depth / length in mm.' },
    { col: 'width', req: 'REQUIRED', fmt: 'Millimeters (mm)', desc: 'Package width in mm.' },
    { col: 'height', req: 'REQUIRED', fmt: 'Millimeters (mm)', desc: 'Package height in mm.' },
    { col: 'images', req: 'Optional', fmt: 'Public URLs', desc: 'Space or comma separated image URLs.' },
    { col: 'brand', req: 'Optional', fmt: 'Text', desc: 'Brand manufacturer name.' },
    { col: 'barcode', req: 'Optional', fmt: 'EAN-13 / UPC', desc: 'Manufacturer barcode.' },
    { col: 'description', req: 'Optional', fmt: 'Text', desc: 'Product marketing description / bullet points.' },
  ];

  guideData.forEach((row) => {
    const r = guideWs.addRow(row);
    r.height = 20;
    r.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10 };
      if (colNumber === 2 && cell.value === 'REQUIRED') {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
      }
    });
  });

  return wb;
}
