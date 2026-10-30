import { mkdirSync, readdirSync, readFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMongoDb } from '../mongo';
import { prisma } from '../prisma';
import { deleteCatalogRunDoc, listCatalogRunDocs, loadCatalogRun, saveCatalogRun } from './runStore.js';

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

async function lookupSavedRows(asins) {
  const wanted = [...new Set(asins.map((asin) => String(asin || '').toUpperCase()).filter(Boolean))];
  if (!wanted.length) return new Map();
  try {
    const rows = await (await getMongoDb()).collection('catalog_products').find({ asin: { $in: wanted } }).toArray();
    const found = new Map();
    for (const row of rows) {
      let urls = [];
      try { urls = JSON.parse(row.image_urls || '[]'); } catch { urls = []; }
      const asin = String(row.asin || '').toUpperCase();
      found.set(asin, { ...row, image_urls: Array.isArray(urls) ? urls : [] });
    }
    return found;
  } catch {
    return new Map();
  }
}

async function withSavedMedia(runId, items) {
  const list = Array.isArray(items) ? items : [];
  const byAsin = new Map(
    savedProducts(runId)
      .filter((product) => product?.asin)
      .map((product) => [String(product.asin).toUpperCase(), product]),
  );
  const missing = list
    .map((item) => String(item?.asin || '').toUpperCase())
    .filter((asin) => asin && !httpImage(byAsin.get(asin)?.image_urls?.find?.((url) => httpImage(url))) && !httpImage(list.find((item) => String(item?.asin || '').toUpperCase() === asin)?.imageUrl));
  for (const [asin, row] of await lookupSavedRows(missing)) {
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

async function lookupScrapedAt(asins) {
  const wanted = [...new Set(asins.map((asin) => String(asin || '').toUpperCase()).filter(Boolean))];
  if (!wanted.length) return new Map();
  try {
    const rows = await (await getMongoDb()).collection('catalog_products').find(
      { asin: { $in: wanted } },
      { projection: { asin: 1, scraped_at: 1 } },
    ).toArray();
    const found = new Map();
    for (const row of rows) {
      if (row?.scraped_at) found.set(String(row.asin || '').toUpperCase(), row.scraped_at);
    }
    return found;
  } catch {
    return new Map();
  }
}

async function flagPreviouslySaved(items, startedAt) {
  const list = Array.isArray(items) ? items : [];
  const started = startedAt ? new Date(startedAt).getTime() : 0;
  const missing = list.filter((item) => typeof item?.previouslySaved !== 'boolean').map((item) => item?.asin);
  const savedAt = await lookupScrapedAt(missing);
  return list.map((item) => {
    if (typeof item?.previouslySaved === 'boolean') return item;
    const asin = String(item?.asin || '').toUpperCase();
    const when = savedAt.get(asin);
    const scraped = when ? new Date(when).getTime() : 0;
    const previouslySaved = Boolean(started && scraped && scraped + 120000 < started);
    return { ...item, previouslySaved };
  });
}

const STALE_RUN_MS = 5 * 60 * 1000;

function imageList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cardsFromProducts(rows) {
  return (Array.isArray(rows) ? rows : []).filter((product) => product?.asin).map((product) => {
    const imageUrl = imageList(product.image_urls).find((url) => /^https?:\/\//i.test(String(url || ''))) || '';
    return {
      asin: product.asin,
      name: product.name || '',
      brand: product.brand || '',
      imageUrl: String(imageUrl || ''),
      amazonUrl: product.amazon_url || `https://www.amazon.in/dp/${product.asin}`,
      priceInr: product.price_inr ?? null,
      weightGrams: product.weight_grams ?? null,
      previouslySaved: Boolean(product.previouslySaved),
    };
  });
}

function writeJson(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2));
}

export async function assignRunAccount(runId, accountId) {
  if (!isSafeRunId(runId)) return false;
  mkdirSync(RUNS_DIR, { recursive: true });
  const jobPath = path.join(RUNS_DIR, `${runId}.job.json`);
  let job = readJson(jobPath);
  if (!job) {
    const stored = await loadCatalogRun(runId).catch(() => null);
    job = stored?.job || null;
  }
  if (!job) return false;
  job.accountId = accountId;
  writeJson(jobPath, job);
  const statusPath = path.join(RUNS_DIR, `${runId}.json`);
  let status = readJson(statusPath);
  if (!status) {
    const stored = await loadCatalogRun(runId).catch(() => null);
    status = stored?.status || null;
  }
  if (status) {
    status.accountId = accountId;
    status.updatedAt = new Date().toISOString();
    writeJson(statusPath, status);
  }
  await saveCatalogRun(runId, { job, ...(status ? { status } : {}) }).catch(() => {});
  return true;
}

function killCatalogProcess(runId) {
  const pidFile = path.join(RUNS_DIR, `${runId}.pid`);
  let pid = 0;
  try {
    pid = Number(readFileSync(pidFile, 'utf8'));
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    if (process.platform === 'win32') process.kill(pid);
    else {
      try { process.kill(-pid, 'SIGTERM'); } catch { process.kill(pid, 'SIGTERM'); }
    }
  } catch {
    /* the scraper already exited */
  }
}

export async function stopCatalogRun(runId, options = {}) {
  if (!isSafeRunId(runId)) return false;
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(path.join(RUNS_DIR, `${runId}.cancel`), '');
  killCatalogProcess(runId);
  const stale = Boolean(options.stale);
  const statusPath = path.join(RUNS_DIR, `${runId}.json`);
  let status = readJson(statusPath);
  let productRows = savedProducts(runId);
  if (!status || !productRows.length) {
    const stored = await loadCatalogRun(runId).catch(() => null);
    status = status || stored?.status || { runId };
    if (!productRows.length && Array.isArray(stored?.products)) productRows = stored.products;
  }
  const saved = cardsFromProducts(productRows);
  const hadPreview = Array.isArray(status.preview) && status.preview.length > 0;
  const preview = hadPreview ? status.preview : saved;
  status.preview = preview;
  if (!hadPreview && saved.length) {
    status.blocked = Array.isArray(status.blocked) ? status.blocked : [];
    status.progress = {
      scraped: 0,
      processed: 0,
      pushed: 0,
      failed: 0,
      total: 0,
      ...(status.progress || {}),
      scraped: Number(status.progress?.scraped) || saved.length,
      processed: Number(status.progress?.processed) || saved.length,
      total: Number(status.progress?.total) || saved.length,
    };
  }
  status.status = preview.length ? 'awaiting_confirm' : 'failed';
  status.currentStep = 'stopped';
  status.updatedAt = new Date().toISOString();
  status.notice = stale
    ? 'This run stopped updating. Products already scraped are still listed.'
    : 'This run was stopped. Products already scraped are still listed.';
  writeJson(statusPath, status);
  await saveCatalogRun(runId, { status, ...(productRows.length ? { products: productRows } : {}) }).catch(() => {});
  return true;
}

function isStaleRun(status) {
  if (!status || (status.status !== 'pending' && status.status !== 'running')) return false;
  const stamp = Date.parse(status.updatedAt || status.startedAt || '');
  return Number.isFinite(stamp) && Date.now() - stamp > STALE_RUN_MS;
}

export async function deleteCatalogRun(runId) {
  if (!isSafeRunId(runId)) return false;
  let removed = false;
  if (existsSync(RUNS_DIR)) {
    const names = readdirSync(RUNS_DIR).filter((name) => name === `${runId}.json` || name.startsWith(`${runId}.`));
    for (const name of names) unlinkSync(path.join(RUNS_DIR, name));
    removed = names.length > 0;
  }
  await deleteCatalogRunDoc(runId).catch(() => {});
  return removed || true;
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

export async function readCatalogStatus(runId) {
  if (!isSafeRunId(runId)) return null;
  let status = readJson(path.join(RUNS_DIR, `${runId}.json`));
  let job = readJson(path.join(RUNS_DIR, `${runId}.job.json`));
  if (!status || !job || !existsSync(path.join(RUNS_DIR, `${runId}.products.json`))) {
    const stored = await loadCatalogRun(runId).catch(() => null);
    if (stored?.status && !status) status = stored.status;
    if (stored?.job && !job) job = stored.job;
    if (Array.isArray(stored?.products) && stored.products.length && !existsSync(path.join(RUNS_DIR, `${runId}.products.json`))) {
      mkdirSync(RUNS_DIR, { recursive: true });
      writeFileSync(path.join(RUNS_DIR, `${runId}.products.json`), JSON.stringify(stored.products));
    }
  }
  if (!status && !job) return null;
  const cancelFile = path.join(RUNS_DIR, `${runId}.cancel`);
  const stillActive = status?.status === 'pending' || status?.status === 'running';
  if (stillActive && (isStaleRun(status) || existsSync(cancelFile))) {
    await stopCatalogRun(runId, { stale: isStaleRun(status) && !existsSync(cancelFile) });
    status = readJson(path.join(RUNS_DIR, `${runId}.json`)) || status;
  }
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
    preview: await flagPreviouslySaved(await withSavedMedia(runId, status?.preview), status?.startedAt),
    blocked: await flagPreviouslySaved(await withSavedMedia(runId, status?.blocked), status?.startedAt),
    weightBands: job?.weightBands || null,
    scrapeRules: job?.scrapeRules || null,
    applyWeightGate: job?.applyWeightGate === true,
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
  const ids = new Set();
  if (existsSync(RUNS_DIR)) {
    for (const name of readdirSync(RUNS_DIR)) {
      const match = name.match(/^([a-zA-Z0-9_-]+)\.(json|job\.json)$/);
      if (match && isSafeRunId(match[1])) ids.add(match[1]);
    }
  }
  try {
    const docs = await listCatalogRunDocs();
    for (const doc of docs) {
      const id = String(doc?._id || '');
      if (isSafeRunId(id)) ids.add(id);
    }
  } catch {
    /* file runs still show when the database cannot be reached */
  }
  if (!ids.size) return [];
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const runs = await Promise.all([...ids].map((runId) => readCatalogStatus(runId)));
  return runs
    .filter(Boolean)
    .map((run) => ({ ...run, accountName: names.get(run.accountId) || 'Unknown account' }))
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}
