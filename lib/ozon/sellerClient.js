import { ozonPost } from '../../ozon-http.js';

const IMPORT_URL = 'https://api-seller.ozon.ru/v3/product/import';
const LOOKUP_URL = 'https://api-seller.ozon.ru/v3/product/info/list';
const ATTR_URL = 'https://api-seller.ozon.ru/v4/product/info/attributes';
const PRICES_URL = 'https://api-seller.ozon.ru/v1/product/import/prices';
const IMPORT_INFO_URL = 'https://api-seller.ozon.ru/v1/product/import/info';
const ARCHIVE_URL = 'https://api-seller.ozon.ru/v1/product/archive';
const DELETE_URL = 'https://api-seller.ozon.ru/v2/products/delete';
const STOCK_URL = 'https://api-seller.ozon.ru/v2/products/stocks';
const STOCKS_INFO_URL = 'https://api-seller.ozon.ru/v4/product/info/stocks';
const WAREHOUSE_LIST_URL = 'https://api-seller.ozon.ru/v1/warehouse/list';
const WAREHOUSE_LIST_V2_URL = 'https://api-seller.ozon.ru/v2/warehouse/list';
const DESCRIPTION_URL = 'https://api-seller.ozon.ru/v1/product/info/description';

export function sellerHeaders(account) {
  return {
    'Client-Id': String(account.client_id),
    'Api-Key': account.api_key,
  };
}

export function ozonErrorMessage(data, status) {
  const code = String(data?.code || data?.error?.code || '').trim();
  const message = data?.message
    || data?.error?.message
    || (typeof data?.error === 'string' ? data.error : '')
    || data?.result?.errors?.[0]?.message
    || data?.result?.items?.[0]?.errors?.[0]?.message
    || code;
  if (typeof message === 'string' && message.trim()) return message.slice(0, 300);
  return `Ozon returned HTTP ${status}.`;
}

function logExchange(label, requestBody, status, responseBody) {
  const request = JSON.stringify(requestBody).slice(0, 2000);
  const response = JSON.stringify(responseBody ?? {}).slice(0, 2000);
  console.info(`[ozon-import] ${label} http ${status} request ${request} response ${response}`);
}

async function postJson(url, body, account, label) {
  const response = await ozonPost(url, body, sellerHeaders(account));
  const data = await response.json().catch(() => ({}));
  logExchange(label, body, response.status, data);
  return { response, data };
}

export async function findOffers(account, offerIds) {
  const found = new Map();
  const unique = [...new Set(offerIds.map((id) => String(id || '').trim()).filter(Boolean))];
  for (let index = 0; index < unique.length; index += 50) {
    const offer_id = unique.slice(index, index + 50);
    const { response, data } = await postJson(LOOKUP_URL, { offer_id }, account, 'lookup');
    if (!response.ok) {
      const error = new Error(ozonErrorMessage(data, response.status));
      error.status = response.status;
      throw error;
    }
    const items = data.items || data.result?.items || [];
    items.forEach((item) => {
      if (item?.offer_id) found.set(String(item.offer_id), { productId: item.id ?? item.product_id ?? null });
    });
  }
  return found;
}

function firstItem(data) {
  const items = data?.items || data?.result?.items || data?.result || [];
  return Array.isArray(items) ? items[0] || null : null;
}

export async function fetchProductInfo(account, { productId, offerId }) {
  const body = productId && !String(productId).startsWith('local-')
    ? { product_id: [Number(productId)] }
    : { offer_id: [String(offerId || '')] };
  const { response, data } = await postJson(LOOKUP_URL, body, account, 'product-info');
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  return firstItem(data);
}

export async function fetchProductAttributes(account, { productId, offerId }) {
  const filter = { visibility: 'ALL' };
  if (productId && !String(productId).startsWith('local-')) filter.product_id = [String(productId)];
  else filter.offer_id = [String(offerId || '')];
  const { response, data } = await postJson(ATTR_URL, { filter, limit: 1, sort_dir: 'ASC' }, account, 'product-attrs');
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  return firstItem(data);
}

export async function updatePrices(account, prices) {
  const body = {
    prices: prices.map((item) => {
      const row = {
        offer_id: String(item.offerId),
        price: String(item.price),
        old_price: item.oldPrice == null || item.oldPrice === '' ? '0' : String(item.oldPrice),
        currency_code: item.currency || 'USD',
      };
      if (item.productId && !String(item.productId).startsWith('local-') && Number(item.productId)) {
        row.product_id = Number(item.productId);
      }
      if (item.vat != null && item.vat !== '') row.vat = String(item.vat);
      return row;
    }),
  };
  const { response, data } = await postJson(PRICES_URL, body, account, 'prices');
  const results = data?.result || [];
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  const failed = results.find((row) => row.updated === false || (row.errors && row.errors.length));
  if (failed) {
    const message = failed.errors?.map((item) => item.message || item.code).filter(Boolean).join('; ')
      || 'Ozon did not update the price.';
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return results;
}

export async function importItems(account, items) {
  const { response, data } = await postJson(IMPORT_URL, { items }, account, 'import');
  const taskId = data?.result?.task_id;
  if (!response.ok || !taskId) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.ok ? 502 : response.status;
    error.ozonStatus = response.status;
    throw error;
  }
  return { taskId: String(taskId), data };
}

export async function readImportTask(account, taskId) {
  const { response, data } = await postJson(IMPORT_INFO_URL, { task_id: Number(taskId) }, account, 'import-info');
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  const items = data?.result?.items || data?.items || [];
  return items;
}

export async function listWarehouses(account) {
  let { response, data } = await postJson(WAREHOUSE_LIST_URL, {}, account, 'warehouses');
  if (!response.ok) {
    ({ response, data } = await postJson(WAREHOUSE_LIST_V2_URL, {}, account, 'warehouses-v2'));
  }
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  const rows = data?.result || data?.warehouses || [];
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    warehouse_id: row.warehouse_id ?? row.id,
    name: row.name || '',
    status: row.status || '',
  })).filter((row) => row.warehouse_id);
}

export async function fetchProductStocks(account, { productId, offerId }) {
  const filter = { visibility: 'ALL' };
  if (productId && !String(productId).startsWith('local-')) filter.product_id = [String(productId)];
  else filter.offer_id = [String(offerId || '')];
  const { response, data } = await postJson(STOCKS_INFO_URL, { filter, limit: 1 }, account, 'stocks-info');
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  return firstItem(data);
}

export async function fetchProductDescription(account, productId) {
  if (!productId || String(productId).startsWith('local-')) return '';
  const { response, data } = await postJson(DESCRIPTION_URL, { product_id: Number(productId) }, account, 'description');
  if (!response.ok) return '';
  return String(data?.result?.description || data?.description || '').trim();
}

export async function pushStock(account, { offerId, stock, warehouseId }) {
  const body = {
    stocks: [{
      offer_id: String(offerId),
      stock: Number(stock),
      warehouse_id: Number(warehouseId),
    }],
  };
  const { response, data } = await postJson(STOCK_URL, body, account, 'stock');
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  const rowError = data?.result?.[0]?.errors?.[0]?.message;
  if (rowError) {
    const error = new Error(String(rowError).slice(0, 300));
    error.status = 400;
    throw error;
  }
}

function goneMessage(value) {
  return /not found|не найден|doesn't exist|does not exist/i.test(String(value || ''));
}

export async function removeOfferFromOzon(account, offerId) {
  const offer = String(offerId || '').trim();
  if (!offer) return { removed: false };

  let productId = null;
  try {
    const found = await findOffers(account, [offer]);
    productId = found.get(offer)?.productId || null;
  } catch (error) {
    if (error.ozonExhausted || error.status === 429) throw error;
  }

  if (productId) {
    const archived = await postJson(ARCHIVE_URL, { product_id: [Number(productId)] }, account, 'archive');
    if (!archived.response.ok && !goneMessage(ozonErrorMessage(archived.data, archived.response.status))) {
      const error = new Error(ozonErrorMessage(archived.data, archived.response.status));
      error.status = archived.response.status;
      throw error;
    }
  }

  const removed = await postJson(DELETE_URL, { products: [{ offer_id: offer }] }, account, 'delete');
  if (!removed.response.ok) {
    const message = ozonErrorMessage(removed.data, removed.response.status);
    if (goneMessage(message)) return { removed: true };
    const error = new Error(message);
    error.status = removed.response.status;
    throw error;
  }
  const row = removed.data?.status?.[0];
  if (row && row.is_deleted === false) {
    if (goneMessage(row.error)) return { removed: true };
    const error = new Error(String(row.error || 'Ozon did not delete this product.').slice(0, 300));
    error.status = 400;
    throw error;
  }
  return { removed: true };
}
