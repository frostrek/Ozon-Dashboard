import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';
import { listCatalogRuns } from '../../../../lib/catalog/listRuns';

export const dynamic = 'force-dynamic';

const DASHBOARD_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function safeRoot() {
  return process.env.CATALOG_SAFE_ROOT
    || path.resolve(DASHBOARD_ROOT, 'safe-pipeline');
}

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

async function supabaseState() {
  const fileEnv = readEnvFile(path.join(safeRoot(), '.env'));
  const url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || fileEnv.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) return { state: 'off', label: 'Cloud sync off' };
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/products?select=asin&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (!response.ok) return { state: 'failed', label: 'Sync failed' };
    return { state: 'connected', label: 'Supabase connected' };
  } catch {
    return { state: 'failed', label: 'Saved locally' };
  }
}

export async function GET() {
  let sqliteOk = false;
  let sqliteLabel = 'Local database unavailable';
  try {
    await prisma.account.count();
    const catalogDb = existsSync(path.join(safeRoot(), 'ozon-pipeline.db'));
    sqliteOk = true;
    sqliteLabel = catalogDb ? 'Local SQLite also active' : 'App database connected';
  } catch {
    sqliteOk = false;
  }

  const running = await prisma.pipelineRun.findFirst({
    where: { status: 'running' },
  }).catch(() => null);

  const lastSuccess = await prisma.pipelineRun.findFirst({
    where: { status: 'success' },
    orderBy: { start_time: 'desc' },
  }).catch(() => null);

  const isSyncing = !!running;
  const lastSync = lastSuccess ? lastSuccess.start_time : null;
  let ageMinutes = null;
  if (lastSync) ageMinutes = Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000);

  const cloud = isSyncing ? { state: 'syncing', label: 'Syncing' } : await supabaseState();
  let runs = [];
  try {
    runs = await listCatalogRuns();
  } catch {
    runs = [];
  }
  const latestNote = runs.find((run) => run.storageNote)?.storageNote || '';
  const savedLocally = /local catalog|cloud sync is off|supabase is unavailable/i.test(latestNote);

  let syncState = 'connected';
  if (!sqliteOk) syncState = 'failed';
  else if (isSyncing || cloud.state === 'syncing') syncState = 'syncing';
  else if (cloud.state === 'failed') syncState = savedLocally ? 'saved_locally' : 'failed';
  else if (cloud.state === 'off') syncState = 'saved_locally';
  else if (ageMinutes === null) syncState = 'pending';

  let notifications = [];
  try {
    const errors = await prisma.errorLog.findMany({
      where: { status: 'OPEN' },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { id: true, message: true, severity: true, created_at: true },
    });
    notifications = errors.map((item) => ({
      id: item.id,
      message: item.message,
      level: item.severity || 'ERROR',
      at: item.created_at,
      href: '/logs',
    }));
  } catch {
    notifications = [];
  }
  for (const run of runs.filter((item) => item.status === 'failed').slice(0, 3)) {
    notifications.push({
      id: run.runId,
      message: run.notice || `${run.keyword || 'Catalog run'} failed`,
      level: 'ERROR',
      at: run.updatedAt || run.startedAt,
      href: `/catalog/runs/${run.runId}`,
    });
  }

  return NextResponse.json({
    isSyncing,
    lastSync,
    ageMinutes,
    sqlite: { ok: sqliteOk, label: sqliteLabel },
    supabase: cloud,
    syncState,
    storageNote: latestNote,
    notifications,
    user: {
      name: process.env.DASHBOARD_USERNAME || 'Signed in',
      role: 'Operator',
    },
  });
}
