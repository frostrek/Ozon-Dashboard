import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { killProcessTree } from './killTree';
import { prisma } from '../prisma';
import { isCancelling } from './cancelGuard';
import { ozonPauseReason } from '../../ozon-http.js';

const PROJECT_ROOT = process.cwd();

function resolveBun() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    const exe = path.join(process.env.APPDATA, 'npm', 'node_modules', 'bun', 'bin', 'bun.exe');
    if (existsSync(exe)) return exe;
  }
  return 'bun';
}

export async function startPipelineRun(accountId, options = {}) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    const error = new Error('Account not found');
    error.status = 404;
    throw error;
  }
  if (!account.client_id || !account.api_key) {
    const error = new Error('Account is missing an Ozon client id or API key');
    error.status = 400;
    throw error;
  }
  const paused = ozonPauseReason(account.client_id);
  if (paused) {
    const error = new Error(paused);
    error.status = 429;
    throw error;
  }

  const alreadyRunning = await prisma.pipelineRun.findMany({
    where: { account_id: account.id, status: 'running' },
  });
  for (const old of alreadyRunning) {
    if (old.pid) await killProcessTree(old.pid).catch(() => {});
    await prisma.pipelineRun.update({
      where: { id: old.id },
      data: {
        status: 'cancelled',
        cancelled: true,
        stage: 'cancelled',
        end_time: new Date(),
        pid: null,
        error_message: 'Stopped because a new pipeline was started.',
      },
    }).catch(() => {});
  }

  const run = await prisma.pipelineRun.create({
    data: {
      account_id: account.id,
      status: 'running',
      stage: 'starting',
      start_time: new Date(),
    },
  });

  const bunBin = resolveBun();
  const childEnv = { ...process.env };
  if (String(childEnv.PUPPETEER_CACHE_DIR || '').includes('cursor-sandbox-cache')) {
    delete childEnv.PUPPETEER_CACHE_DIR;
  }
  const chromePath = [
    childEnv.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].find((file) => file && existsSync(file));
  if (chromePath) childEnv.PUPPETEER_EXECUTABLE_PATH = chromePath;
  if (options.dateFrom && options.dateTo) {
    childEnv.PIPELINE_DATE_FROM = options.dateFrom;
    childEnv.PIPELINE_DATE_TO = options.dateTo;
  }
  let child;
  try {
    child = spawn(bunBin, ['pipeline-runner.js', account.id, run.id], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: childEnv,
    });
  } catch (err) {
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        stage: 'failed',
        end_time: new Date(),
        error_message: err.message,
      },
    });
    throw err;
  }

  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});

  child.on('error', async (err) => {
    console.error(`[pipeline/start] spawn error for ${run.id}: ${err.message}`);
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        stage: 'failed',
        end_time: new Date(),
        error_message: err.message,
      },
    }).catch(() => {});
  });

  child.on('exit', async (code) => {
    if (isCancelling(run.id)) return;
    const current = await prisma.pipelineRun.findUnique({ where: { id: run.id } });
    if (!current || current.status !== 'running') return;
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: code === 0 ? 'success' : 'failed',
        end_time: new Date(),
        error_message: code === 0 ? null : `Pipeline exited with code ${code}`,
      },
    }).catch(() => {});
  });

  child.on('spawn', () => {
    if (!child.pid) return;
    prisma.pipelineRun.update({
      where: { id: run.id },
      data: { pid: child.pid },
    }).catch(() => {});
  });

  if (child.pid) {
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { pid: child.pid },
    });
  }

  return { runId: run.id, pid: child.pid || null };
}
