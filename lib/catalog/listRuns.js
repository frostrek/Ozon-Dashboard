import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { prisma } from '../prisma';

const RUNS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'runs', 'catalog-runs');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function isSafeRunId(runId) {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(String(runId || ''));
}

export function readCatalogJob(runId) {
  if (!isSafeRunId(runId)) return null;
  return readJson(path.join(RUNS_DIR, `${runId}.job.json`));
}

function httpImage(value) {
  const url = String(value || '');
  return /^https?:\/\//i.test(url) ? url : '';
}

function savedProducts(runId) {
  const rows = readJson(path.join(RUNS_DIR, `${runId}.products.json`));
  return Array.isArray(rows) ? rows : [];
}

function mediaFor(product) {
  if (!product) return { name: '', brand: '', imageUrl: '', amazonUrl: '', priceInr: null };
  const urls = Array.isArray(product.image_urls) ? product.image_urls : [];
  return {
    name: product.name || '',
    brand: product.brand || '',
    imageUrl: httpImage(urls.find((url) => httpImage(url))),
    amazonUrl: product.amazon_url || (product.asin ? `https://www.amazon.in/dp/${product.asin}` : ''),
    priceInr: product.price_inr ?? null,
  };
}

function catalogSqlitePath() {
  return process.env.CATALOG_SQLITE
    || path.resolve(RUNS_DIR, '..', '..', 'safe-pipeline', 'ozon-pipeline.db');
}

function lookupSavedRows(asins) {
  const file = catalogSqlitePath();
  const wanted = [...new Set(asins.map((asin) => String(asin || '').toUpperCase()).filter(Boolean))];
  if (!wanted.length || !existsSync(file)) return new Map();
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const stmt = db.prepare('SELECT asin, name, brand, image_urls, amazon_url, price_inr FROM products WHERE asin = ?');
    const found = new Map();
    for (const asin of wanted) {
      const row = stmt.get(asin);
      if (!row) continue;
      let urls = [];
      try { urls = JSON.parse(row.image_urls || '[]'); } catch { urls = []; }
      found.set(asin, { ...row, image_urls: Array.isArray(urls) ? urls : [] });
    }
    db.close();
    return found;
  } catch {
    return new Map();
  }
}

function withSavedMedia(runId, items) {
  const list = Array.isArray(items) ? items : [];
  const byAsin = new Map(
    savedProducts(runId)
      .filter((product) => product?.asin)
      .map((product) => [String(product.asin).toUpperCase(), product]),
  );
  const missing = list
    .map((item) => String(item?.asin || '').toUpperCase())
    .filter((asin) => asin && !httpImage(byAsin.get(asin)?.image_urls?.find?.((url) => httpImage(url))) && !httpImage(list.find((item) => String(item?.asin || '').toUpperCase() === asin)?.imageUrl));
  for (const [asin, row] of lookupSavedRows(missing)) {
    if (!byAsin.has(asin)) byAsin.set(asin, row);
    else if (!httpImage((byAsin.get(asin).image_urls || []).find?.((url) => httpImage(url)))) {
      byAsin.set(asin, { ...byAsin.get(asin), ...row, image_urls: row.image_urls });
    }
  }
  return (Array.isArray(items) ? items : []).map((item) => {
    const media = mediaFor(byAsin.get(String(item?.asin || '').toUpperCase()));
    return {
      ...media,
      ...item,
      name: item?.name || media.name,
      brand: item?.brand || media.brand,
      imageUrl: httpImage(item?.imageUrl) || media.imageUrl,
      amazonUrl: item?.amazonUrl || media.amazonUrl,
      priceInr: item?.priceInr ?? media.priceInr,
    };
  });
}

function retryCount(status) {
  const asins = new Set();
  for (const item of status?.errors || []) {
    if (item?.asin) asins.add(String(item.asin).toUpperCase());
  }
  for (const task of status?.tasks || []) {
    for (const item of task.items || []) {
      if (item.status === 'failed' && item.offerId) asins.add(String(item.offerId).toUpperCase());
    }
  }
  return asins.size;
}

export function readCatalogStatus(runId) {
  if (!isSafeRunId(runId)) return null;
  const status = readJson(path.join(RUNS_DIR, `${runId}.json`));
  const job = readJson(path.join(RUNS_DIR, `${runId}.job.json`));
  if (!status && !job) return null;
  const progress = status?.progress || { scraped: 0, processed: 0, pushed: 0, failed: 0, total: 0 };
  const checkpoint = existsSync(path.join(RUNS_DIR, `${runId}.checkpoint.json`));
  const products = existsSync(path.join(RUNS_DIR, `${runId}.products.json`));
  const failed = (status?.status || '') === 'failed';
  return {
    runId,
    accountId: status?.accountId || job?.accountId || '',
    keyword: job?.keyword || '',
    brand: job?.brand || '',
    mode: status?.mode || job?.mode || 'bulk',
    action: status?.action || job?.action || 'full',
    asin: job?.asin || '',
    pages: job?.pages || 1,
    oldPriceMultiplier: job?.oldPriceMultiplier || 2,
    categoryLabel: job?.category?.label || '',
    status: status?.status || 'pending',
    progress,
    currentStep: status?.currentStep || 'starting',
    errors: Array.isArray(status?.errors) ? status.errors : [],
    taskIds: Array.isArray(status?.taskIds) ? status.taskIds : [],
    tasks: Array.isArray(status?.tasks) ? status.tasks : [],
    preview: withSavedMedia(runId, status?.preview),
    blocked: withSavedMedia(runId, status?.blocked),
    logs: Array.isArray(status?.logs) ? status.logs.slice(-150) : [],
    pushedAsins: Array.isArray(status?.pushedAsins) ? status.pushedAsins : [],
    deletedAsins: Array.isArray(status?.deletedAsins) ? status.deletedAsins : [],
    offerAccounts: status?.offerAccounts && typeof status.offerAccounts === 'object' ? status.offerAccounts : {},
    startedAt: status?.startedAt || '',
    updatedAt: status?.updatedAt || '',
    rateLimited: Boolean(status?.rateLimited),
    notice: status?.notice || '',
    storageNote: status?.storageNote || '',
    resumable: checkpoint || (failed && products),
    retryCount: retryCount(status),
  };
}

export async function listCatalogRuns() {
  if (!existsSync(RUNS_DIR)) return [];
  const ids = new Set();
  for (const name of readdirSync(RUNS_DIR)) {
    const match = name.match(/^([a-zA-Z0-9_-]+)\.(json|job\.json)$/);
    if (match && isSafeRunId(match[1])) ids.add(match[1]);
  }
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  return [...ids]
    .map((runId) => {
      const run = readCatalogStatus(runId);
      if (!run) return null;
      return { ...run, accountName: names.get(run.accountId) || 'Unknown account' };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}
