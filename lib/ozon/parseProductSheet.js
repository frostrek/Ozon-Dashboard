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
