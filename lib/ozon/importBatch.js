import { prisma } from '../prisma';
import { mapProductToOzonItem } from './mapProductImport';
import { findOffers, importItems, pushStock } from './sellerClient';

const CHUNK = 10;

function readAttrs(product) {
  try { return JSON.parse(product.attributes_json || '{}'); } catch { return {}; }
}

function taskError(item) {
  const errors = item?.errors || [];
  const message = errors.map((error) => error.message || error.description || error.code).filter(Boolean).join('; ');
  return message.slice(0, 300);
}

function rowFromTask(entry, taskId, taskItems) {
  const match = taskItems?.find((item) => String(item.offer_id) === entry.item.offer_id);
  const statusText = String(match?.status || '').toLowerCase();
  const error = match ? taskError(match) : '';
  let status = 'pending';
  if (statusText === 'imported' || statusText === 'success') status = 'success';
  else if (statusText === 'failed' || error) status = 'failed';
  return {
    productId: entry.product.id,
    offerId: entry.item.offer_id,
    status,
    action: entry.action,
    taskId,
    ozonProductId: match?.product_id ? String(match.product_id) : entry.existingProductId || null,
    error: status === 'failed' ? (error || 'Ozon rejected this product.') : '',
    warning: entry.warning || '',
  };
}

async function sendChunk(account, chunk) {
  try {
    const { taskId } = await importItems(account, chunk.map((entry) => entry.item));
    return chunk.map((entry) => rowFromTask(entry, taskId, null));
  } catch (error) {
    if (error.ozonExhausted || error.status === 429 || chunk.length === 1) {
      return chunk.map((entry) => ({
        productId: entry.product.id,
        offerId: entry.item.offer_id,
        status: 'failed',
        action: entry.action,
        taskId: null,
        ozonProductId: entry.existingProductId || null,
        error: error.message || 'Ozon did not accept this product.',
        warning: '',
      }));
    }
    const rows = [];
    for (const entry of chunk) rows.push(...await sendChunk(account, [entry]));
    return rows;
  }
}

async function applyStock(account, entries, rows) {
  const byOffer = new Map(rows.map((row) => [row.offerId, row]));
  for (const entry of entries) {
    const row = byOffer.get(entry.item.offer_id);
    if (!row || row.status === 'failed') continue;
    const warehouseId = readAttrs(entry.product).warehouse_id;
    if (warehouseId == null || warehouseId === '' || entry.product.stock == null) {
      if (entry.product.stock != null) row.warning = 'Stock is stored locally. Add warehouse_id to update Ozon stock.';
      continue;
    }
    try {
      await pushStock(account, { offerId: entry.item.offer_id, stock: entry.product.stock, warehouseId });
    } catch (error) {
      row.warning = `Product was sent, but stock was not updated: ${error.message}`;
      if (error.ozonExhausted || error.status === 429) break;
    }
  }
}

async function persist(product, row) {
  const attrs = readAttrs(product);
  if (row.taskId) {
    attrs.ozon_import_task_id = row.taskId;
    attrs.ozon_import_offer_id = row.offerId;
    attrs.ozon_import_at = new Date().toISOString();
    attrs.ozon_import_action = row.action;
  }
  const data = {
    attributes_json: JSON.stringify(attrs),
    status: row.status === 'failed' ? 'ERROR' : (row.status === 'success' ? product.status : 'PENDING'),
    status_name: row.status === 'failed'
      ? String(row.error || 'Ozon rejected this product.').slice(0, 180)
      : (row.status === 'success' ? (product.status_name || 'Imported') : 'Import sent'),
  };
  if (row.ozonProductId && String(product.ozon_id || '').startsWith('local-')) {
    const clash = await prisma.product.findFirst({
      where: { account_id: product.account_id, ozon_id: String(row.ozonProductId), NOT: { id: product.id } },
    });
    if (!clash) data.ozon_id = String(row.ozonProductId);
  }
  await prisma.product.update({ where: { id: product.id }, data });
  await prisma.auditLog.create({
    data: {
      account_id: product.account_id,
      product_id: product.id,
      type: 'OZON_IMPORT',
      old_value: product.ozon_id || '',
      new_value: row.taskId ? String(row.taskId) : '',
      status: row.status === 'failed' ? 'FAILED' : 'SUCCESS',
      error: row.error || row.warning || null,
    },
  });
}

async function importAccountProducts(account, products) {
  const ready = [];
  const results = [];
  products.forEach((product) => {
    try {
      ready.push({ product, item: mapProductToOzonItem(product), action: 'create', existingProductId: null, warning: '' });
    } catch (error) {
      results.push({
        productId: product.id,
        offerId: product.sku || '',
        status: 'failed',
        action: 'create',
        taskId: null,
        ozonProductId: null,
        error: error.message,
        warning: '',
      });
    }
  });

  if (ready.length) {
    try {
      const existing = await findOffers(account, ready.map((entry) => entry.item.offer_id));
      ready.forEach((entry) => {
        const match = existing.get(entry.item.offer_id);
        if (match) {
          entry.action = 'update';
          entry.existingProductId = match.productId ? String(match.productId) : null;
        }
      });
    } catch (error) {
      if (error.ozonExhausted || error.status === 429) {
        const blocked = ready.map((entry) => ({
          productId: entry.product.id,
          offerId: entry.item.offer_id,
          status: 'failed',
          action: 'create',
          taskId: null,
          ozonProductId: null,
          error: error.message,
          warning: '',
        }));
        const all = [...results, ...blocked];
        await persistRows(products, all);
        return all;
      }
      ready.forEach((entry) => {
        entry.warning = `Could not check whether this offer already exists: ${error.message}`;
      });
    }
  }

  for (let index = 0; index < ready.length; index += CHUNK) {
    const chunk = ready.slice(index, index + CHUNK);
    const rows = await sendChunk(account, chunk);
    await applyStock(account, chunk, rows);
    results.push(...rows);
  }

  await persistRows(products, results);
  return results;
}

async function persistRows(products, results) {
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const row of results) {
    const product = byId.get(row.productId);
    if (product) await persist(product, row);
  }
}

export async function importStoredProducts(products) {
  const groups = new Map();
  products.forEach((product) => {
    if (!groups.has(product.account_id)) groups.set(product.account_id, []);
    groups.get(product.account_id).push(product);
  });

  const results = [];
  for (const group of groups.values()) {
    const account = group[0].account;
    if (!account?.client_id || !account?.api_key) {
      group.forEach((product) => {
        results.push({
          productId: product.id,
          offerId: product.sku || '',
          status: 'failed',
          action: 'create',
          taskId: null,
          ozonProductId: null,
          error: 'This account has no Ozon client ID or API key.',
          warning: '',
        });
      });
      continue;
    }
    results.push(...await importAccountProducts(account, group));
  }

  return {
    total: results.length,
    success: results.filter((row) => row.status === 'success').length,
    failed: results.filter((row) => row.status === 'failed').length,
    pending: results.filter((row) => row.status === 'pending').length,
    results,
  };
}
