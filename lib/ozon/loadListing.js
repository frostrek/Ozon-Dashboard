import { prisma } from '../prisma';
import {
  fetchProductAttributes,
  fetchProductDescription,
  fetchProductInfo,
  fetchProductStocks,
  listWarehouses,
} from './sellerClient';

function readJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function text(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)[0] || '';
  return value == null ? '' : String(value).trim();
}

function numberOrEmpty(value) {
  if (value == null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
}

function imageList(...groups) {
  const urls = [];
  for (const group of groups) {
    const list = Array.isArray(group) ? group : (group ? [group] : []);
    for (const item of list) {
      const url = typeof item === 'string' ? item : (item?.file_name || item?.url || '');
      if (typeof url === 'string' && /^https:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}

function attrText(attributes, id) {
  const row = (attributes || []).find((item) => Number(item.id) === Number(id));
  const value = row?.values?.[0];
  return text(value?.value || value?.dictionary_value || '');
}

function descriptionOf(info, attributes) {
  return text(info?.description)
    || attrText(attributes, 4191)
    || attrText(attributes, 22336)
    || '';
}

export function listingFormFromProduct(product) {
  const attrs = readJson(product.attributes_json, {});
  const dimensions = attrs.dimensions && typeof attrs.dimensions === 'object' ? attrs.dimensions : {};
  const images = readJson(product.images_json, []);
  return {
    name: product.name || '',
    sku: product.sku || '',
    brand: product.brand || attrText(attrs.attributes, 85) || '',
    color: attrs.color || '',
    size: attrs.size || '',
    description: attrs.description || '',
    price: product.price ?? '',
    old_price: product.old_price ?? '',
    stock: product.stock ?? '',
    currency: product.currency || 'RUB',
    vat: attrs.vat ?? '',
    barcode: attrs.barcode || '',
    weight: attrs.weight ?? product.volume_weight ?? '',
    depth: attrs.depth ?? dimensions.depth ?? '',
    width: attrs.width ?? dimensions.width ?? '',
    height: attrs.height ?? dimensions.height ?? '',
    description_category_id: attrs.description_category_id ?? '',
    type_id: attrs.type_id ?? '',
    keywords: attrs.keywords || '',
    hashtags: attrs.hashtags || '',
    warehouse_id: attrs.warehouse_id ?? '',
    warehouse_name: attrs.warehouse_name || '',
    images: Array.isArray(images) ? images.join('\n') : '',
  };
}

function stocksFromOzon(stockItem, warehouses) {
  const rows = Array.isArray(stockItem?.stocks) ? stockItem.stocks : [];
  let present = 0;
  let reserved = 0;
  let fbo = 0;
  const warehouseIds = [];
  for (const row of rows) {
    const type = String(row.type || row.source || '').toLowerCase();
    const qty = Number(row.present) || 0;
    const hold = Number(row.reserved) || 0;
    const ids = row.warehouse_ids || (row.warehouse_id ? [row.warehouse_id] : []);
    if (type === 'fbo') fbo += qty;
    else {
      present += qty;
      reserved += hold;
    }
    for (const id of ids) if (id && !warehouseIds.includes(id)) warehouseIds.push(id);
  }
  const firstWarehouse = warehouses.find((item) => warehouseIds.map(String).includes(String(item.warehouse_id)))
    || warehouses[0]
    || null;
  return {
    present,
    reserved,
    fbo,
    warehouse_id: firstWarehouse?.warehouse_id || warehouseIds[0] || '',
    warehouse_name: firstWarehouse?.name || '',
    warehouses,
  };
}

export function mergeOzonIntoProduct(product, info, attrItem, extra = {}) {
  const previous = readJson(product.attributes_json, {});
  const attributes = Array.isArray(attrItem?.attributes) ? attrItem.attributes : (previous.attributes || []);
  const images = imageList(
    attrItem?.images,
    attrItem?.primary_image,
    info?.images,
    info?.primary_image,
    readJson(product.images_json, []),
  );
  const barcode = text(attrItem?.barcode || attrItem?.barcodes || info?.barcode || info?.barcodes || previous.barcode);
  const brand = text(info?.brand) || attrText(attributes, 85) || product.brand || '';
  const vat = attrItem?.vat ?? info?.vat ?? previous.vat ?? '';
  const stockInfo = extra.stockInfo || {};
  const nextAttrs = {
    ...previous,
    description: extra.description || descriptionOf(info || {}, attributes) || previous.description || '',
    description_category_id: attrItem?.description_category_id ?? info?.description_category_id ?? previous.description_category_id ?? '',
    type_id: attrItem?.type_id ?? info?.type_id ?? previous.type_id ?? '',
    vat,
    barcode,
    color: previous.color || attrText(attributes, 10096) || attrText(attributes, 10097) || '',
    weight: attrItem?.weight ?? info?.weight ?? previous.weight ?? product.volume_weight ?? '',
    weight_unit: attrItem?.weight_unit || previous.weight_unit || 'g',
    depth: attrItem?.depth ?? info?.depth ?? previous.depth ?? '',
    width: attrItem?.width ?? info?.width ?? previous.width ?? '',
    height: attrItem?.height ?? info?.height ?? previous.height ?? '',
    dimension_unit: attrItem?.dimension_unit || previous.dimension_unit || 'mm',
    warehouse_id: stockInfo.warehouse_id || previous.warehouse_id || '',
    warehouse_name: stockInfo.warehouse_name || previous.warehouse_name || '',
    warehouses: stockInfo.warehouses || previous.warehouses || [],
    attributes,
    ozon_synced_at: new Date().toISOString(),
  };

  const price = Number(info?.price ?? info?.marketing_price ?? product.price);
  const oldPrice = info?.old_price == null || info.old_price === '' ? product.old_price : Number(info.old_price);
  const stock = Number.isFinite(Number(stockInfo.present)) ? Number(stockInfo.present) : product.stock;

  return {
    name: text(info?.name || attrItem?.name || product.name),
    sku: text(info?.offer_id || attrItem?.offer_id || product.sku),
    brand: brand || null,
    price: Number.isFinite(price) ? price : product.price,
    old_price: Number.isFinite(Number(oldPrice)) ? Number(oldPrice) : product.old_price,
    currency: info?.currency_code || product.currency || 'RUB',
    stock,
    reserved_stock: Number.isFinite(Number(stockInfo.reserved)) ? Number(stockInfo.reserved) : product.reserved_stock,
    fbo_stock: Number.isFinite(Number(stockInfo.fbo)) ? Number(stockInfo.fbo) : product.fbo_stock,
    volume_weight: Number(nextAttrs.weight) || product.volume_weight,
    images_json: JSON.stringify(images),
    attributes_json: JSON.stringify(nextAttrs),
  };
}

export async function refreshListingFromOzon(product) {
  const account = product.account;
  if (!account?.client_id || !account?.api_key) {
    return { product, warning: 'This account has no Ozon API key, so the form shows the dashboard copy only.' };
  }
  if (String(product.ozon_id || '').startsWith('local-') && !product.sku) {
    return { product, warning: 'This product is not on Ozon yet.' };
  }
  try {
    const info = await fetchProductInfo(account, { productId: product.ozon_id, offerId: product.sku });
    let attrItem = null;
    let stockItem = null;
    let warehouses = [];
    let description = '';
    try {
      attrItem = await fetchProductAttributes(account, { productId: product.ozon_id, offerId: product.sku });
    } catch {
      attrItem = null;
    }
    try {
      stockItem = await fetchProductStocks(account, { productId: product.ozon_id, offerId: product.sku });
    } catch {
      stockItem = null;
    }
    try {
      warehouses = await listWarehouses(account);
    } catch {
      warehouses = [];
    }
    try {
      description = await fetchProductDescription(account, product.ozon_id);
    } catch {
      description = '';
    }
    if (!info && !attrItem) {
      return { product, warning: 'Ozon did not return this listing. The dashboard copy is shown.' };
    }
    const data = mergeOzonIntoProduct(product, info || {}, attrItem || {}, {
      description,
      stockInfo: stocksFromOzon(stockItem, warehouses),
    });
    const updated = await prisma.product.update({
      where: { id: product.id },
      data,
      include: { account: { select: { id: true, name: true } } },
    });
    return { product: updated, warning: '' };
  } catch (error) {
    return {
      product,
      warning: error.message || 'Ozon listing details could not be loaded. The dashboard copy is shown.',
    };
  }
}

export function missingPushFields(form) {
  const missing = [];
  if (!String(form.sku || '').trim()) missing.push('SKU');
  if (!String(form.name || '').trim()) missing.push('name');
  if (form.price === '' || form.price == null || Number.isNaN(Number(form.price))) missing.push('price');
  if (!numberOrEmpty(form.description_category_id)) missing.push('category ID');
  if (!numberOrEmpty(form.type_id)) missing.push('type ID');
  if (!String(form.images || '').split(/\s+/).some((url) => /^https:\/\//i.test(url))) missing.push('https image');
  if (form.vat == null || String(form.vat).trim() === '') missing.push('VAT');
  if (numberOrEmpty(form.weight) === '') missing.push('weight');
  if (!numberOrEmpty(form.depth) || !numberOrEmpty(form.width) || !numberOrEmpty(form.height)) {
    missing.push('depth, width, and height');
  }
  return missing;
}
