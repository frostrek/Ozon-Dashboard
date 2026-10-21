function readJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function imageList(product) {
  const images = readJson(product.images_json, []);
  if (!Array.isArray(images)) return [];
  return images.filter((url) => typeof url === 'string' && /^https:\/\//i.test(url));
}

function barcodeOf(attrs) {
  const value = attrs.barcode ?? attrs.barcodes ?? attrs.ean;
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)[0] || '';
  return String(value || '').trim();
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function mapProductToOzonItem(product) {
  const attrs = readJson(product.attributes_json, {});
  const images = imageList(product);
  const dimensions = attrs.dimensions || {};
  const weight = numberOrNull(attrs.weight ?? product.volume_weight);
  const depth = numberOrNull(attrs.depth ?? dimensions.depth);
  const width = numberOrNull(attrs.width ?? dimensions.width);
  const height = numberOrNull(attrs.height ?? dimensions.height);
  const categoryId = numberOrNull(attrs.description_category_id);
  const typeId = numberOrNull(attrs.type_id);
  const missing = [];

  if (!product.sku) missing.push('SKU / offer_id');
  if (!product.name) missing.push('name');
  if (product.price == null || Number.isNaN(Number(product.price))) missing.push('price');
  if (!categoryId) missing.push('Ozon category ID (description_category_id)');
  if (!typeId) missing.push('Ozon type ID (type_id)');
  if (!images.length) missing.push('at least one public https image');
  if (attrs.vat == null || attrs.vat === '') missing.push('VAT');
  if (weight == null) missing.push('weight');
  if (depth == null || width == null || height == null) missing.push('depth, width, and height');

  if (missing.length) {
    const error = new Error(`This product cannot be sent to Ozon yet. Missing: ${missing.join(', ')}.`);
    error.status = 400;
    throw error;
  }

  const item = {
    offer_id: String(product.sku),
    name: product.name,
    description_category_id: categoryId,
    type_id: typeId,
    price: String(product.price),
    currency_code: product.currency || 'RUB',
    vat: String(attrs.vat),
    images,
    primary_image: images[0],
    weight,
    weight_unit: attrs.weight_unit || 'g',
    depth,
    width,
    height,
    dimension_unit: attrs.dimension_unit || 'mm',
  };

  if (product.old_price != null && product.old_price !== '') item.old_price = String(product.old_price);
  const barcode = barcodeOf(attrs);
  if (barcode) item.barcode = barcode;

  const attributes = attributeList(product, attrs);
  if (attributes.length) item.attributes = attributes;
  return item;
}

function attributeList(product, attrs) {
  const list = Array.isArray(attrs.attributes) ? [...attrs.attributes] : [];
  pushAttribute(list, 85, product.brand);
  pushAttribute(list, attrs.description_attribute_id, attrs.description);
  pushAttribute(list, attrs.color_attribute_id, attrs.color);
  pushAttribute(list, attrs.size_attribute_id, attrs.size);
  pushAttribute(list, attrs.material_attribute_id, attrs.material);
  return list;
}

function pushAttribute(list, id, value) {
  const attrId = numberOrNull(id);
  const text = String(value || '').trim();
  if (!attrId || !text) return;
  if (list.some((item) => Number(item.id) === attrId)) return;
  list.push({ id: attrId, complex_id: 0, values: [{ value: text }] });
}
