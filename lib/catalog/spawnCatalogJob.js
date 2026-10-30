import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DASHBOARD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNS_DIR = path.join(DASHBOARD_ROOT, "runs", "catalog-runs");
const RUNNER = path.join(DASHBOARD_ROOT, "catalog-runner.js");
const SAFE_ROOT = process.env.CATALOG_SAFE_ROOT
  || path.resolve(DASHBOARD_ROOT, "safe-pipeline");

function resolveBun() {
  if (process.platform === "win32" && process.env.APPDATA) {
    const exe = path.join(process.env.APPDATA, "npm", "node_modules", "bun", "bin", "bun.exe");
    if (existsSync(exe)) return exe;
  }
  return "bun";
}

function markSpawnFailed(runId, message) {
  const statusPath = catalogStatusPath(runId);
  let current = {};
  if (existsSync(statusPath)) {
    try {
      current = JSON.parse(readFileSync(statusPath, "utf8"));
    } catch {
      current = {};
    }
  }
  const at = new Date().toISOString();
  current.status = "failed";
  current.currentStep = "failed";
  current.updatedAt = at;
  current.notice = message;
  current.errors = [{ asin: "", reason: message }];
  current.logs = [...(Array.isArray(current.logs) ? current.logs : []), { at, level: "error", message }];
  writeFileSync(statusPath, JSON.stringify(current, null, 2));
}

export function catalogStatusPath(runId) {
  return path.join(RUNS_DIR, `${runId}.json`);
}

/**
 * Start a catalog job. Call this from a server route in Phase 3.
 * `account` is the Prisma row. `job` must not contain api_key.
 * The child reads safe-pipeline/.env because its cwd is that folder.
 * OZON_CLIENT_ID and OZON_API_KEY are set here and override that file.
 */
export function startCatalogJob({ runId, account, job, preserveStatus = false }) {
  if (!account?.client_id || !account?.api_key) {
    throw new Error("Choose a seller account that has credentials.");
  }
  const bunBin = resolveBun();
  const probe = spawnSync(bunBin, ["--version"], { windowsHide: true, stdio: "ignore" });
  if (probe.status !== 0) {
    const error = new Error("The catalog run could not be started because Bun is not installed on this server. Scraping has to run on a machine with Bun. The saved product list still works.");
    error.status = 503;
    throw error;
  }
  const safeJob = {
    runId,
    accountId: account.id,
    mode: job.mode || "bulk",
    action: job.action || "full",
    asin: job.asin || "",
    scrape: job.scrape !== false,
    resume: Boolean(job.resume),
    keyword: job.keyword || "",
    brand: job.brand || "",
    pages: Number(job.pages) === 0 ? 0 : Math.min(10, Math.max(1, Number(job.pages) || 1)),
    startPage: Math.max(1, Number(job.startPage) || 1),
    oldPriceMultiplier: Number(job.oldPriceMultiplier) || 2,
    maxProducts: Number(job.maxProducts) === 0 ? 0 : Math.max(1, Number(job.maxProducts) || 20),
    applyWeightGate: job.applyWeightGate !== false,
    weightGateGrams: job.applyWeightGate === false ? 0 : 500,
    weightBands: job.weightBands || null,
    scrapeRules: job.scrapeRules || null,
    category: job.category || null,
    asins: Array.isArray(job.asins)
      ? [...new Set(job.asins.map((asin) => String(asin || '').trim().toUpperCase()).filter((asin) => /^[A-Z0-9]+(?:-P\d+)?$/.test(asin)))].slice(0, 500)
      : [],
  };
  mkdirSync(RUNS_DIR, { recursive: true });
  const jobPath = path.join(RUNS_DIR, `${runId}.job.json`);
  writeFileSync(jobPath, JSON.stringify(safeJob, null, 2));
  const statusPath = catalogStatusPath(runId);
  if (preserveStatus && existsSync(statusPath)) {
    const current = JSON.parse(readFileSync(statusPath, "utf8"));
    current.status = "pending";
    current.currentStep = safeJob.action;
    current.updatedAt = new Date().toISOString();
    current.rateLimited = false;
    writeFileSync(statusPath, JSON.stringify(current, null, 2));
  } else {
    writeFileSync(statusPath, JSON.stringify({
      runId,
      accountId: account.id,
      mode: safeJob.mode,
      action: safeJob.action,
      status: "pending",
      progress: { scraped: 0, processed: 0, pushed: 0, failed: 0, total: 0 },
      currentStep: "starting",
      errors: [],
      taskIds: [],
      tasks: [],
      preview: [],
      blocked: [],
      logs: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rateLimited: false,
      notice: "",
      storageNote: "",
    }, null, 2));
  }

  const child = spawn(bunBin, [RUNNER, "--job", jobPath], {
    cwd: SAFE_ROOT,
    env: {
      ...process.env,
      OZON_CLIENT_ID: String(account.client_id).trim(),
      OZON_API_KEY: String(account.api_key).trim(),
      CATALOG_SAFE_ROOT: SAFE_ROOT,
    },
    detached: process.platform !== "win32",
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", (error) => {
    const missing = error?.code === "ENOENT";
    markSpawnFailed(
      runId,
      missing
        ? "The catalog job did not start because bun was not found. Install bun, then start the run again."
        : `The catalog job did not start: ${error?.message || "bun could not be launched."}`,
    );
  });
  child.unref();
  return { runId, statusPath: catalogStatusPath(runId) };
}
