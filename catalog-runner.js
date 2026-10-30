#!/usr/bin/env bun
/**
 * Catalog job runner. Started by the dashboard as a child process.
 * Do not import this file, or m9-ozon-push.js, from Next.js.
 *
 * Credentials come from the parent environment (OZON_CLIENT_ID, OZON_API_KEY).
 * They are never written to the status file or the job file.
 *
 *   bun catalog-runner.js --job runs/catalog-runs/<runId>.job.json
 *
 * The dashboard process sets the environment, then:
 *
 *   spawn("bun", ["catalog-runner.js", "--job", jobPath], {
 *     cwd: SAFE_OZON_ROOT,
 *     env: { ...process.env, OZON_CLIENT_ID: account.client_id, OZON_API_KEY: account.api_key },
 *     detached: true,
 *     stdio: "ignore",
 *   })
 */

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bandAllows, bandsChosen, weightBandFor } from "./lib/catalog/weightBands.js";
import { customBlockReason, normalizeRules, outOfStock } from "./lib/catalog/scrapeRules.js";

const DASHBOARD_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SAFE_ROOT = process.env.CATALOG_SAFE_ROOT
  || path.resolve(DASHBOARD_ROOT, "safe-pipeline");
const RUNS_DIR = path.join(DASHBOARD_ROOT, "runs", "catalog-runs");
const BLOCKS_FILE = path.join(DASHBOARD_ROOT, "runs", ".ozon-blocks.json");
const BLOCK_MS = 6 * 60 * 60 * 1000;

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function clientId() {
  return String(process.env.OZON_CLIENT_ID || "").trim();
}

function pauseUntil(id) {
  const saved = readJson(BLOCKS_FILE, {});
  return Number(saved[id]) || 0;
}

function rememberPauseOnce(id) {
  if (!id) return;
  const saved = readJson(BLOCKS_FILE, {});
  if (Number(saved[id]) > Date.now()) return;
  saved[id] = Date.now() + BLOCK_MS;
  mkdirSync(path.dirname(BLOCKS_FILE), { recursive: true });
  writeFileSync(BLOCKS_FILE, JSON.stringify(saved));
}

const RATE_MESSAGE = "Ozon returned 429. This account is paused for about 6 hours. The run stopped immediately, and no further request was sent, so the pause is not refreshed.";

let rateLimited = false;
let authFailed = false;
let authMessage = "";

function explainAuth(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("expired")) {
    return "The Ozon API key for this account has expired. Open Accounts, paste a new key from Ozon Seller, and start the run again. No further request was sent.";
  }
  if (lower.includes("invalid") || lower.includes("api-key") || lower.includes("api key")) {
    return "Ozon rejected this account's API key. Check the client ID and key on the Accounts page. No further request was sent.";
  }
  return "Ozon refused this account's credentials. Check the client ID and API key on the Accounts page. The run stopped so no further request was sent.";
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input || "");
  const ozon = url.includes("api-seller.ozon.ru");
  if (ozon && rateLimited) {
    const error = new Error(RATE_MESSAGE);
    error.ozonExhausted = true;
    throw error;
  }
  if (ozon && authFailed) {
    const error = new Error(authMessage);
    error.ozonAuth = true;
    throw error;
  }
  const response = await originalFetch(input, init);
  if (!ozon) return response;
  if (response.status === 429) {
    rateLimited = true;
    rememberPauseOnce(clientId());
    const error = new Error(RATE_MESSAGE);
    error.ozonExhausted = true;
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    const text = await response.text();
    authFailed = true;
    authMessage = explainAuth(text);
    const error = new Error(authMessage);
    error.ozonAuth = true;
    throw error;
  }
  return response;
};

const jobPath = readArg("--job");
const job = readJson(jobPath, null);
if (!job?.runId) {
  console.error("Missing --job <runId job json>.");
  process.exit(1);
}
if (job.api_key || job.apiKey || job.OZON_API_KEY) {
  console.error("Refusing a job file that contains an API key.");
  process.exit(1);
}

const statusPath = path.join(RUNS_DIR, `${job.runId}.json`);
const checkpointPath = path.join(RUNS_DIR, `${job.runId}.checkpoint.json`);
const productsPath = path.join(RUNS_DIR, `${job.runId}.products.json`);

const state = {
  runId: job.runId,
  accountId: job.accountId || "",
  mode: job.mode || "bulk",
  action: job.action || "full",
  status: "running",
  progress: { scraped: 0, processed: 0, pushed: 0, failed: 0, total: 0 },
  currentStep: "starting",
  errors: [],
  taskIds: [],
  tasks: [],
  preview: [],
  blocked: [],
  logs: [],
  pushedAsins: [],
  deletedAsins: [],
  offerAccounts: {},
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  rateLimited: false,
  notice: "",
  storageNote: "",
};

let logDirty = false;

function redact(text) {
  let clean = String(text || "").replace(/\x1b\[[0-9;]*m/g, "");
  clean = clean.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  clean = clean.replace(/(api[_-]?key|client-id)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  const secret = String(process.env.OZON_API_KEY || "").trim();
  if (secret && clean.includes(secret)) clean = clean.split(secret).join("[redacted]");
  return clean.trim();
}

function log(level, message) {
  const clean = redact(message).slice(0, 400);
  if (!clean) return;
  state.logs.push({ at: new Date().toISOString(), level, message: clean });
  if (state.logs.length > 200) state.logs.splice(0, state.logs.length - 200);
  logDirty = true;
}

function hookConsole() {
  for (const level of ["log", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const text = args.map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return arg.message;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(" ");
      log(level === "log" ? "info" : level, text);
      original(...args);
    };
  }
}

function writeStatus(patch = {}) {
  Object.assign(state, patch);
  state.updatedAt = new Date().toISOString();
  logDirty = false;
  mkdirSync(RUNS_DIR, { recursive: true });
  const temp = `${statusPath}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2));
  renameSync(temp, statusPath);
}

function loadExisting() {
  const saved = readJson(statusPath, null);
  if (!saved) return "";
  state.progress = { total: 0, scraped: 0, processed: 0, pushed: 0, failed: 0, ...(saved.progress || {}) };
  state.errors = Array.isArray(saved.errors) ? saved.errors : [];
  state.taskIds = Array.isArray(saved.taskIds) ? saved.taskIds : [];
  state.tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
  state.preview = Array.isArray(saved.preview) ? saved.preview : [];
  state.blocked = Array.isArray(saved.blocked) ? saved.blocked : [];
  state.logs = Array.isArray(saved.logs) ? saved.logs : [];
  state.pushedAsins = Array.isArray(saved.pushedAsins) ? saved.pushedAsins : [];
  state.deletedAsins = Array.isArray(saved.deletedAsins) ? saved.deletedAsins : [];
  state.offerAccounts = saved.offerAccounts && typeof saved.offerAccounts === 'object' ? saved.offerAccounts : {};
  state.startedAt = saved.startedAt || state.startedAt;
  state.notice = saved.notice || "";
  state.storageNote = saved.storageNote || "";
  return saved.status || "";
}

function fail(step, message) {
  log("error", message);
  writeStatus({
    status: "failed",
    currentStep: step,
    notice: message,
    errors: [...state.errors, { asin: "", reason: message }],
  });
  process.exit(1);
}

function assertCategory() {
  const catId = Number(job.category?.catId);
  const typeId = Number(job.category?.typeId);
  if (!catId || !typeId) {
    fail("category", "No Ozon category was selected. Search for a category on the new-run page and start again.");
  }
  const file = path.join(SAFE_ROOT, "ozon-tree-en-cache.json");
  if (!existsSync(file)) return;
  const tree = readJson(file, []);
  const found = Array.isArray(tree) && tree.some((item) => Number(item.catId) === catId && Number(item.typeId) === typeId);
  if (!found) {
    fail("category", `Category ${catId} / ${typeId} is not in the Ozon category list. Search again and choose a listed category.`);
  }
}

function emptyReason() {
  const scraped = Number(state.progress.scraped) || 0;
  const blocked = state.blocked.length;
  const keyword = String(job.keyword || "").trim();
  if (job.mode === "single" && job.scrape === false && !scraped) {
    return `ASIN ${job.asin || ""} is not in the local catalog. Enter a keyword so it can be scraped, or scrape it in a bulk run first.`;
  }
  if (!scraped) {
    return keyword
      ? `Amazon returned no products for "${keyword}". Try a broader keyword, clear the brand, or raise the page count.`
      : "Amazon returned no products. Try a broader keyword or raise the page count.";
  }
  if (blocked) {
    return `Amazon returned ${scraped} product(s). None of them match the weights you chose, or they have no price, so nothing will be pushed.`;
  }
  if (job.mode === "single" && job.asin) {
    return `ASIN ${job.asin} was not in the scrape results. Check the ASIN and keyword, then run it again.`;
  }
  return "No products are ready to push. The scrape was empty, or every item was outside the weights you chose or missing a price.";
}

function explainOzonError(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  if (!text) return "Ozon did not accept this product.";
  if (/operation timed out|request timed out/i.test(lower)) {
    return "The connection timed out before this push finished. Nothing new was sent. Select the product and push again.";
  }
  if (/^(Ozon |This product |The )/.test(text)) return text.slice(0, 320);
  if (lower.includes("title_corrupted")) return "The Russian title failed the title check, so this product was not pushed.";
  if (lower.includes("price_is_0")) return "The USD price came out at 0, so this product was not pushed.";
  if (lower.includes("invalid_volume")) return "The size or volume is not valid for this category. Check the product size and try again.";
  if (lower.includes("pre_upload_gate") || lower.includes("upload_blocked")) {
    return `This product failed the pre-upload check: ${text.replace(/^.*?:\s*/, "").slice(0, 280)}`;
  }
  if (lower.includes("description_category") || lower.includes("type_id")) {
    return "Ozon does not accept this category. Search again and choose a category from the list.";
  }
  if (lower.includes("image") || lower.includes("picture") || lower.includes("photo")) {
    return `Ozon rejected an image. ${text.slice(0, 280)}`;
  }
  if (lower.includes("attribute") || lower.includes("атрибут")) {
    return `Ozon rejected an attribute. ${text.slice(0, 280)}`;
  }
  return text.slice(0, 320);
}

function assertReady() {
  if (!clientId() || !String(process.env.OZON_API_KEY || "").trim()) {
    fail("starting", "The selected account has no Ozon credentials.");
  }
  const until = pauseUntil(clientId());
  if (until > Date.now()) {
    writeStatus({
      status: "failed",
      currentStep: "rate_limited",
      rateLimited: true,
      notice: "This seller account is already paused after too many requests. No Ozon request was sent, so the pause is not refreshed.",
      errors: [...state.errors, { asin: "", reason: "This seller account is already paused after too many requests. No Ozon request was sent." }],
    });
    process.exit(1);
  }
}

function loadModules() {
  const load = (name) => import(pathToFileURL(path.join(SAFE_ROOT, name)).href);
  return Promise.all([
    load("m1-m3-scraper.js"),
    load("m5-insert.js"),
    load("m6-translate.js"),
    load("m7-pricing.js"),
    load("m9-ozon-push.js"),
    load("m-local-db.js"),
  ]).then(([scraper, insert, translate, pricing, push, db]) => ({ scraper, insert, translate, pricing, push, db }));
}

function gate() {
  return Number(job.weightGateGrams) || 500;
}

function primaryImage(product) {
  const list = Array.isArray(product?.image_urls) ? product.image_urls : [];
  const url = list.find((item) => /^https?:\/\//i.test(String(item || "")));
  return url ? String(url) : "";
}

function productCard(product, extra = {}) {
  return {
    asin: product?.asin || "",
    name: product?.name || "",
    brand: product?.brand || "",
    imageUrl: primaryImage(product),
    amazonUrl: product?.amazon_url || (product?.asin ? `https://www.amazon.in/dp/${product.asin}` : ""),
    priceInr: product?.price_inr ?? null,
    weightGrams: product?.weight_grams ?? null,
    previouslySaved: Boolean(product?.previouslySaved),
    ...extra,
  };
}

function blockReason(product) {
  if (!(Number(product?.price_inr) > 0)) return "Price is missing.";
  const rules = normalizeRules(job.scrapeRules);
  if (rules.inStockOnly && outOfStock(product)) return "Out of stock.";
  const rating = Number(product?.rating);
  if (rules.skipUnrated && !(rating > 0)) return "No star rating.";
  if (rules.minRating > 0 && rating > 0 && rating < rules.minRating) return `Rating is ${rating}, under ${rules.minRating} stars.`;
  if (job.weightBands && bandsChosen(job.weightBands) && !bandAllows(product?.weight_grams, job.weightBands)) {
    return weightBandFor(product?.weight_grams) === "unknown"
      ? "Weight is not listed."
      : `Weight is ${product.weight_grams} g, outside the weights you chose.`;
  }
  if (!job.weightBands && job.applyWeightGate !== false) {
    const limit = gate();
    const weight = product?.weight_grams;
    if (weight == null || weight === "" || !(Number(weight) > 0)) return "Weight is missing.";
    if (Number(weight) > limit) return `Weight is ${weight} g, over the ${limit} g limit.`;
  }
  return customBlockReason(product, rules.custom, Boolean(job.weightBands?.unknown));
}

function splitProducts(products) {
  const ready = [];
  const blocked = [];
  for (const product of products || []) {
    if (!product?.asin) continue;
    const reason = blockReason(product);
    if (reason) {
      blocked.push(productCard(product, { reason }));
    } else {
      ready.push(product);
    }
  }
  return { ready, blocked };
}

async function collectProducts(modules) {
  const reuseFile = existsSync(productsPath) && (
    job.resume || job.action === "push" || job.action === "retry" || job.action === "tasks"
  );
  if (reuseFile) {
    const saved = readJson(productsPath, []);
    log("info", `Using ${saved.length} saved product(s) from this run.`);
    writeStatus({
      currentStep: "process",
      progress: { ...state.progress, processed: saved.length, total: saved.length || state.progress.total },
    });
    return saved;
  }

  if (job.mode === "single" && job.asin && job.scrape === false) {
    const saved = await modules.db.getProductByAsin(String(job.asin).trim().toUpperCase());
    if (!saved) fail("process", `ASIN ${job.asin} is not in the local catalog. Add a keyword so it can be scraped first.`);
    const { ready, blocked } = splitProducts([saved]);
    state.blocked = blocked;
    if (!ready.length) {
      state.errors.push({ asin: saved.asin, reason: blocked[0]?.reason || "This product was not pushed." });
    }
    writeFileSync(productsPath, JSON.stringify(ready));
    writeStatus({
      currentStep: "process",
      progress: { ...state.progress, scraped: 1, processed: ready.length, total: ready.length },
    });
    return ready;
  }

  writeStatus({ currentStep: "scrape" });
  const keyword = String(job.keyword || "").trim();
  if (!keyword) fail("scrape", "A keyword is required before scraping.");
  const brand = String(job.brand || "").trim() || null;
  const pages = Number(job.pages) === 0 ? 0 : Math.max(1, Number(job.pages) || 1);
  const startPage = Math.max(1, Number(job.startPage) || 1);
  if (pages === 0) {
    log("info", "Scraping skipped. Loading products already saved for this keyword.");
    const tokens = keyword.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 2).slice(0, 6);
    let rows = [];
    try {
      rows = await modules.db.findProductsByKeyword(tokens, brand);
    } catch {
      log("warn", "The local catalog database could not be read for existing products.");
    }
    const { ready, blocked } = splitProducts(rows);
    state.blocked = blocked;
    writeFileSync(productsPath, JSON.stringify(ready));
    writeStatus({
      currentStep: "process",
      progress: { ...state.progress, scraped: rows.length, processed: ready.length, total: ready.length },
    });
    if (!ready.length) {
      fail("process", "No saved products match this keyword. Scrape at least one page before skipping.");
    }
    log("info", `Loaded ${ready.length} saved product(s) without scraping.`);
    return ready;
  }
  log("info", `Scraping "${keyword}"${brand ? ` / ${brand}` : ""} for ${pages} page(s), starting at page ${startPage}.`);
  const rules = normalizeRules(job.scrapeRules);
  const scraped = await modules.scraper.runScraper(keyword, brand, rules.minRating, 2, 500, pages, startPage, {
    maxProducts: Number(job.maxProducts) || 0,
    applyWeightGate: job.applyWeightGate !== false,
    weightGateGrams: gate(),
    weightBands: job.weightBands || null,
    scrapeRules: rules,
  });
  log("info", `Scrape returned ${scraped.length} product(s).`);
  let knownAsins = new Set();
  try {
    knownAsins = await modules.db.getExistingAsins();
  } catch {
    log("warn", "Existing catalog products could not be checked, so this run cannot separate them yet.");
  }
  const known = new Set([...knownAsins].map((asin) => String(asin || "").toUpperCase()));
  let already = 0;
  for (const product of scraped) {
    const asin = String(product?.asin || "").toUpperCase();
    if (asin && known.has(asin)) {
      product.previouslySaved = true;
      already += 1;
    }
  }
  if (already) log("info", `${already} product(s) were already in the catalog. They are listed separately from the new scrape.`);
  const lastScrapedPage = startPage + pages - 1;
  try {
    await modules.db.saveScrapeProgress({
      keyword,
      brand: brand || "",
      categoryId: job.category?.catId,
      typeId: job.category?.typeId,
      lastPage: lastScrapedPage,
    });
    log("info", `Saved scrape progress in the catalog database through page ${lastScrapedPage}.`);
  } catch (error) {
    log("warn", `Scrape progress could not be saved: ${error.message}`);
  }
  writeStatus({ progress: { ...state.progress, scraped: scraped.length }, currentStep: "process" });

  let enriched = [];
  try {
    await modules.insert.insertProductsToDb(scraped);
    const split = splitProducts(scraped);
    enriched = split.ready;
    state.blocked = split.blocked;
    if (state.blocked.length) {
      log("warn", `${state.blocked.length} product(s) are outside the weights you chose or have no price.`);
    }
    const storageLog = state.logs.map((entry) => entry.message).join(" ");
    if (/supabase sync failed|supabase quota|supabase cloud: unavailable/i.test(storageLog)) {
      state.storageNote = "Supabase is unavailable. Products were saved in the local catalog database, and this run continued.";
    } else if (/supabase credentials not set/i.test(storageLog)) {
      state.storageNote = "Cloud sync is off. Products were saved in the local catalog database.";
    } else {
      state.storageNote = "Products were saved in the local catalog database.";
    }
  } catch {
    state.storageNote = "The local catalog database could not take this batch. The products stayed in memory and the run continued.";
    state.errors.push({ asin: "", reason: state.storageNote });
    const split = splitProducts(scraped);
    enriched = split.ready;
    state.blocked = split.blocked;
    log("warn", state.storageNote);
  }

  if (job.mode === "single" && job.asin) {
    const asin = String(job.asin).trim().toUpperCase();
    const matched = enriched.filter((product) => String(product.asin).toUpperCase() === asin);
    const blockedMatch = state.blocked.find((product) => String(product.asin).toUpperCase() === asin);
    if (!matched.length && blockedMatch) {
      state.blocked = [blockedMatch];
      state.errors.push({ asin, reason: blockedMatch.reason });
    } else if (!matched.length) {
      state.errors.push({ asin, reason: `ASIN ${asin} was not in the scrape results.` });
    }
    enriched = matched;
    if (matched.length) state.blocked = state.blocked.filter((product) => String(product.asin).toUpperCase() === asin);
  }
  writeFileSync(productsPath, JSON.stringify(enriched));
  writeStatus({ progress: { ...state.progress, scraped: scraped.length, processed: enriched.length, total: enriched.length } });
  return enriched;
}

async function buildPreview(modules, products) {
  writeStatus({ currentStep: "preview" });
  const rate = await modules.pricing.fetchInrUsdRate();
  log("info", `INR to USD rate ${rate}. Building the preview.`);
  const names = products.map((product) => String(product.name || ""));
  let titles = names;
  try {
    titles = await modules.translate.translateStrings(names);
  } catch (error) {
    log("warn", `Russian titles could not be translated: ${error.message}`);
    state.errors.push({ asin: "", reason: `Russian titles could not be translated: ${error.message}` });
  }
  state.preview = products.map((product, index) => productCard(product, {
    titleRu: titles[index] || product.name || "",
    priceInr: product.price_inr,
    priceUsd: modules.pricing.computeUsdPrice(Number(product.price_inr) || 0, rate),
    weightGrams: product.weight_grams,
  }));
  writeStatus({ currentStep: "preview" });
  log("info", `Preview ready for ${state.preview.length} product(s).`);
}

function recordFailure(asin, reason) {
  const next = explainOzonError(reason);
  const existing = state.errors.find((item) => item.asin === asin);
  if (existing) {
    existing.reason = next;
    return false;
  }
  state.errors.push({ asin, reason: next });
  return true;
}

function formatItemError(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return explainOzonError(entry);
  const where = entry.attribute_name || entry.field || (entry.attribute_id ? `Attribute ${entry.attribute_id}` : "");
  const detail = entry.description || entry.message || entry.code || "";
  return explainOzonError([where, detail].filter(Boolean).join(": "));
}

function taskItem(item) {
  const raw = item?.errors || [];
  const errors = (Array.isArray(raw) ? raw : [raw])
    .map(formatItemError)
    .filter(Boolean)
    .slice(0, 4);
  return {
    offerId: item?.offer_id || "",
    productId: item?.product_id || "",
    status: item?.status || "unknown",
    errors,
  };
}

async function refreshTasks(modules) {
  const tasks = [];
  for (const taskId of state.taskIds) {
    if (rateLimited) break;
    log("info", `Checking import task ${taskId}.`);
    try {
      const response = await modules.push.ozonPost("/v1/product/import/info", { task_id: Number(taskId) });
      if (rateLimited) break;
      if (!response?.ok) {
        tasks.push({
          taskId: String(taskId),
          status: "unknown",
          error: redact(response?.text || response?.status || "Task check failed.").slice(0, 200),
          items: [],
        });
        continue;
      }
      const items = (response.json?.result?.items || []).map(taskItem);
      const failed = items.filter((item) => item.status === "failed").length;
      const imported = items.filter((item) => item.status === "imported").length;
      let status = "pending";
      if (failed) status = "failed";
      else if (items.length && imported === items.length) status = "imported";
      tasks.push({ taskId: String(taskId), status, items });
    } catch (error) {
      if (error.ozonAuth || authFailed) throw error;
      if (error.ozonExhausted || rateLimited) {
        rateLimited = true;
        break;
      }
      tasks.push({ taskId: String(taskId), status: "unknown", error: explainOzonError(error.message || error), items: [] });
    }
    writeStatus({ tasks, currentStep: "tasks" });
  }
  for (const task of tasks) {
    for (const item of task.items || []) {
      if (item.status === "failed" && item.errors?.length) {
        recordFailure(item.offerId || "", item.errors.join(" "));
      }
    }
  }
  writeStatus({ tasks });
}

async function pushAll(modules, products, { fromCheckpoint = false, retry = false } = {}) {
  const checkpoint = fromCheckpoint ? readJson(checkpointPath, { lastIndex: -1 }) : { lastIndex: -1 };
  const startIndex = Number(checkpoint.lastIndex) + 1;
  if (startIndex >= products.length) {
    log("info", "Checkpoint is already at the end of this run.");
    return;
  }
  writeStatus({ currentStep: `push ${startIndex + 1}/${products.length}` });
  const rate = await modules.pricing.fetchInrUsdRate();
  const options = {
    descriptionCategoryId: Number(job.category?.catId),
    typeId: Number(job.category?.typeId),
    typeLabel: job.category?.label || "",
    oldPriceMultiplier: Number(job.oldPriceMultiplier) || 2,
    weightGateGrams: gate(),
  };
    if (!options.descriptionCategoryId || !options.typeId) {
    fail("category", "No Ozon category was selected. Search for a category on the new-run page and start again.");
  }
  log("info", `Pushing ${products.length - startIndex} product(s) to Ozon. Category ${options.descriptionCategoryId} / ${options.typeId}.`);

  for (let index = startIndex; index < products.length; index += 1) {
    if (rateLimited) break;
    const product = products[index];
    writeStatus({ currentStep: `push ${index + 1}/${products.length}` });
    try {
      const result = await modules.push.pushProductToOzon(product, rate, options);
      if (rateLimited) break;
      if (result?.success) {
        const hadError = state.errors.some((item) => item.asin === product.asin);
        state.errors = state.errors.filter((item) => item.asin !== product.asin);
        if (retry && hadError) state.progress.failed = Math.max(0, (state.progress.failed || 0) - 1);
        if (!retry || hadError) state.progress.pushed += 1;
        if (result.taskId && !state.taskIds.includes(String(result.taskId))) state.taskIds.push(String(result.taskId));
        const pushedKey = String(product.asin || "").toUpperCase();
        if (pushedKey && !state.pushedAsins.some((asin) => String(asin).toUpperCase() === pushedKey)) {
          state.pushedAsins.push(product.asin);
        }
        if (pushedKey) state.offerAccounts[pushedKey] = job.accountId || state.accountId;
        log("info", `Pushed ${product.asin}${result.taskId ? ` as task ${result.taskId}` : ""}.`);
      } else {
        const reason = String(result?.error || "Ozon did not accept this product.").slice(0, 300);
        if (recordFailure(product.asin, reason)) state.progress.failed += 1;
        log("error", `${product.asin}: ${reason}`);
      }
    } catch (error) {
      if (error.ozonAuth || authFailed) {
        fail("auth", error.message || authMessage);
      }
      if (error.ozonExhausted || rateLimited) {
        rateLimited = true;
        log("error", RATE_MESSAGE);
        break;
      }
      const reason = String(error.message || error).slice(0, 300);
      if (recordFailure(product.asin, reason)) state.progress.failed += 1;
      log("error", `${product.asin}: ${reason}`);
    }
    if (!retry) writeFileSync(checkpointPath, JSON.stringify({ lastIndex: index, lastAsin: product.asin }));
    writeStatus();
  }
}

async function main() {
  const continuing = Boolean(job.resume) || ["push", "retry", "tasks"].includes(job.action);
  const previousStatus = continuing ? loadExisting() : "";
  hookConsole();
  const timer = setInterval(() => {
    if (logDirty) writeStatus();
  }, 2000);
  timer.unref();
  writeStatus({ status: "running", currentStep: "starting", action: job.action || "full" });
  assertReady();
  if (!existsSync(SAFE_ROOT)) fail("starting", "The safe-pipeline folder was not found inside this dashboard.");
  if (job.action !== "tasks") assertCategory();
  process.chdir(SAFE_ROOT);
  const modules = await loadModules();

  if (job.action === "tasks") {
    await refreshTasks(modules);
    const restore = ["failed", "completed", "awaiting_confirm"].includes(previousStatus) ? previousStatus : "completed";
    writeStatus({
      status: rateLimited ? "failed" : restore,
      currentStep: rateLimited ? "rate_limited" : "tasks",
      rateLimited,
      notice: rateLimited ? RATE_MESSAGE : state.notice,
    });
    if (rateLimited) process.exit(1);
    return;
  }

  const products = await collectProducts(modules);
  if (state.blocked.length && products.length) {
    state.notice = `${state.blocked.length} product(s) are outside the weights you chose or have no price. They stay listed on this run and are not pushed.`;
  }
  if (!products.length) {
    const reason = emptyReason();
    log("warn", reason);
    const duplicate = state.errors.some((item) => item.reason === reason);
    writeStatus({
      status: "failed",
      currentStep: "empty",
      notice: reason,
      errors: duplicate ? state.errors : [...state.errors, { asin: job.asin || "", reason }],
    });
    return;
  }
  const needsPreview = job.action === "preview" || job.action === "full" || !state.preview.length;
  if (job.action !== "retry" && needsPreview) await buildPreview(modules, products);
  if (job.action === "preview") {
    writeStatus({ status: "awaiting_confirm", currentStep: "preview" });
    log("info", "Preview is ready. Push has not started.");
    return;
  }

  let targets = products;
  if (job.action === "push" && Array.isArray(job.asins) && job.asins.length) {
    const wanted = new Set(job.asins.map((asin) => String(asin || "").toUpperCase()));
    targets = products.filter((product) => wanted.has(String(product.asin || "").toUpperCase()) && !blockReason(product));
    if (!targets.length) {
      const reason = "None of the selected products can be pushed. They are outside the weights you chose or missing a price.";
      log("warn", reason);
      writeStatus({ status: "awaiting_confirm", currentStep: "preview", notice: reason });
      return;
    }
    log("info", `Pushing ${targets.length} selected product(s).`);
  }
  if (job.action === "retry") {
    const failedAsins = new Set(state.errors.map((item) => String(item.asin || "").toUpperCase()).filter(Boolean));
    for (const task of state.tasks || []) {
      for (const item of task.items || []) {
        if (item.status === "failed" && item.offerId) failedAsins.add(String(item.offerId).toUpperCase());
      }
    }
    targets = products.filter((product) => failedAsins.has(String(product.asin || "").toUpperCase()));
    if (!targets.length) {
      log("info", "No failed products to retry.");
      writeStatus({ status: previousStatus === "failed" ? "failed" : "completed", currentStep: "retry" });
      return;
    }
    log("info", `Retrying ${targets.length} failed product(s).`);
  }

  await pushAll(modules, targets, { fromCheckpoint: Boolean(job.resume), retry: job.action === "retry" });
  if (!rateLimited) await refreshTasks(modules);
  if (rateLimited) {
    writeStatus({
      status: "failed",
      currentStep: "rate_limited",
      rateLimited: true,
      notice: RATE_MESSAGE,
      errors: [...state.errors, { asin: "", reason: RATE_MESSAGE }],
    });
    process.exit(1);
  }
  writeStatus({ status: "completed", currentStep: "completed" });
}

main().catch((error) => {
  if (error.ozonAuth || authFailed) {
    fail("auth", error.message || authMessage || "Ozon rejected this account's API key.");
  }
  if (error.ozonExhausted || rateLimited) {
    writeStatus({
      status: "failed",
      currentStep: "rate_limited",
      rateLimited: true,
      notice: RATE_MESSAGE,
      errors: [...state.errors, { asin: "", reason: RATE_MESSAGE }],
    });
    process.exit(1);
  }
  fail("failed", explainOzonError(error.message || error));
});
