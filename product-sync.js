import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ozonPost, ozonPauseReason } from './ozon-http.js';

const prisma = new PrismaClient();
const PAGE = 100;
const STATUS_FILE = path.join(process.cwd(), 'runs', 'product-sync-status.json');
let pageSize = 100;

function writeStatus(status) {
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }));
}

function itemsOf(data) {
  return data?.items || data?.result?.items || [];
}

function nextToken(data) {
  return data?.cursor || data?.result?.cursor || data?.last_id || data?.result?.last_id || '';
}

async function ozonJson(url, body, headers) {
  const response = await ozonPost(url, body, headers);
  const data = await response.json().catch(() => ({}));
  if (response.status === 400 && Number(body.limit) > 100) {
    pageSize = 100;
    const smaller = { ...body, limit: 100 };
    if (Array.isArray(body.product_id)) smaller.product_id = body.product_id.slice(0, 100);
    return ozonJson(url, smaller, headers);
  }
  if (!response.ok) {
    const error = new Error(data?.message || `Ozon returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function collectPages(url, headers, bodyFor) {
  const items = [];
  let token = '';
  for (let page = 0; page < 60; page += 1) {
    const data = await ozonJson(url, bodyFor(token), headers);
    const batch = itemsOf(data);
    items.push(...batch);
    const next = nextToken(data);
    if (!next || next === token || batch.length < pageSize) break;
    token = next;
  }
  return items;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapProduct(info, archived, stock) {
  const present = stock ? numberOrZero(stock.present) : 0;
  const reserved = stock ? numberOrZero(stock.reserved) : 0;
  const fbo = stock ? numberOrZero(stock.fbo) : 0;
  const available = Math.max(0, present - reserved);
  let status = 'ACTIVE';
  if (archived || info.is_archived || info.is_autoarchived) status = 'ARCHIVED';
  else if (stock && available <= 0 && fbo <= 0) status = 'OUT_OF_STOCK';
  else if (info.statuses?.moderate_status && info.statuses.moderate_status !== 'approved') status = 'ERROR';

  const images = [];
  if (typeof info.primary_image === 'string') images.push(info.primary_image);
  else if (Array.isArray(info.primary_image)) images.push(...info.primary_image);
  for (const image of info.images || []) {
    if (image && !images.includes(image)) images.push(image);
  }

  return {
    ozon_id: String(info.id),
    sku: info.offer_id || String(info.id),
    name: info.name || info.offer_id || String(info.id),
    price: numberOrZero(info.price || info.min_price),
    old_price: info.old_price == null || info.old_price === '' ? null : numberOrZero(info.old_price),
    currency: info.currency_code || null,
    stock: stock ? available : 0,
    reserved_stock: reserved,
    fbo_stock: fbo,
    status,
    moderate_status: info.statuses?.moderate_status || null,
    validation_status: info.statuses?.validation_status || null,
    status_name: info.statuses?.status_name || null,
    variant_group_id: info.model_info?.model_id ? String(info.model_info.model_id) : null,
    is_variant: Boolean(info.model_info?.count > 1),
    ozon_created_at: info.created_at ? new Date(info.created_at) : null,
    volume_weight: info.volume_weight == null ? null : numberOrZero(info.volume_weight),
    images_json: JSON.stringify(images),
    attributes_json: JSON.stringify({
      description_category_id: info.description_category_id || null,
      type_id: info.type_id || null,
      barcode: info.barcode || info.barcodes?.[0] || '',
    }),
  };
}

async function saveProducts(account, products) {
  let saved = 0;
  for (let index = 0; index < products.length; index += 50) {
    const slice = products.slice(index, index + 50);
    await prisma.$transaction(slice.map((product) => prisma.product.upsert({
      where: { account_id_ozon_id: { account_id: account.id, ozon_id: product.ozon_id } },
      update: {
        sku: product.sku,
        name: product.name,
        price: product.price,
        old_price: product.old_price,
        currency: product.currency,
        stock: product.stock,
        reserved_stock: product.reserved_stock,
        fbo_stock: product.fbo_stock,
        status: product.status,
        moderate_status: product.moderate_status,
        validation_status: product.validation_status,
        status_name: product.status_name,
        variant_group_id: product.variant_group_id,
        is_variant: product.is_variant,
        ozon_created_at: product.ozon_created_at,
        volume_weight: product.volume_weight,
        images_json: product.images_json,
        attributes_json: product.attributes_json,
      },
      create: {
        account_id: account.id,
        ozon_id: product.ozon_id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        old_price: product.old_price,
        currency: product.currency,
        stock: product.stock,
        reserved_stock: product.reserved_stock,
        fbo_stock: product.fbo_stock,
        status: product.status,
        moderate_status: product.moderate_status,
        validation_status: product.validation_status,
        status_name: product.status_name,
        variant_group_id: product.variant_group_id,
        is_variant: product.is_variant,
        ozon_created_at: product.ozon_created_at,
        volume_weight: product.volume_weight,
        images_json: product.images_json,
        attributes_json: product.attributes_json,
      },
    })));
    saved += slice.length;
  }
  return saved;
}

async function fetchForAccount(account, onProgress) {
  const headers = { 'Client-Id': account.client_id, 'Api-Key': account.api_key };
  const listed = await collectPages(
    'https://api-seller.ozon.ru/v3/product/list',
    headers,
    (lastId) => ({ filter: { visibility: 'ALL' }, last_id: lastId, limit: pageSize }),
  );
  const archived = new Map(listed.map((item) => [String(item.product_id), Boolean(item.archived)]));
  onProgress(`Found ${listed.length} products on Ozon. Reading details.`);

  const ids = listed.map((item) => item.product_id).filter(Boolean);
  const infoItems = [];
  for (let index = 0; index < ids.length; index += pageSize) {
    const data = await ozonJson(
      'https://api-seller.ozon.ru/v3/product/info/list',
      { product_id: ids.slice(index, index + pageSize) },
      headers,
    );
    infoItems.push(...itemsOf(data));
    onProgress(`Read details for ${infoItems.length} of ${ids.length} products.`);
  }

  const stockItems = await collectPages(
    'https://api-seller.ozon.ru/v4/product/info/stocks',
    headers,
    (cursor) => ({ filter: { visibility: 'ALL' }, cursor, limit: pageSize }),
  );
  const stocks = new Map();
  for (const item of stockItems) {
    let present = 0;
    let reserved = 0;
    let fbo = 0;
    for (const row of item.stocks || []) {
      if (row.type === 'fbo') fbo += numberOrZero(row.present);
      else {
        present += numberOrZero(row.present);
        reserved += numberOrZero(row.reserved);
      }
    }
    stocks.set(String(item.product_id), { present, reserved, fbo });
  }

  return infoItems.map((info) => mapProduct(info, archived.get(String(info.id)), stocks.get(String(info.id))));
}

async function run() {
  const targetAccountId = process.argv[2];
  const accounts = await prisma.account.findMany({
    where: targetAccountId ? { id: targetAccountId, active: true } : { active: true },
    select: { id: true, name: true, client_id: true, api_key: true },
  });

  let saved = 0;
  let stopped = '';
  for (const account of accounts) {
    const pause = ozonPauseReason(account.client_id);
    if (pause) {
      console.log(`[product-sync] Skipping ${account.name}. ${pause}`);
      stopped = pause;
      continue;
    }
    writeStatus({ running: true, accountName: account.name, saved, message: `Reading products for ${account.name}.` });
    try {
      const products = await fetchForAccount(account, (message) => {
        console.log(`[product-sync] ${account.name}: ${message}`);
        writeStatus({ running: true, accountName: account.name, saved, message });
      });
      const count = await saveProducts(account, products);
      saved += count;
      console.log(`[product-sync] Saved ${count} products for ${account.name}.`);
      writeStatus({ running: true, accountName: account.name, saved, message: `Saved ${saved} products.` });
    } catch (error) {
      stopped = error.ozonExhausted
        ? error.message
        : (error.message || 'Product sync stopped.');
      console.error(`[product-sync] Stopped for ${account.name}: ${stopped}`);
      break;
    }
  }

  writeStatus({
    running: false,
    saved,
    message: stopped ? `${stopped} Saved ${saved} products before stopping.` : `Saved ${saved} products.`,
  });
}

run().catch((error) => {
  console.error('[product-sync]', error.message);
  writeStatus({ running: false, saved: 0, message: error.message || 'Product sync failed.' });
}).finally(() => prisma.$disconnect());
