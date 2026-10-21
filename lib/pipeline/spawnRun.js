import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
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

export async function startPipelineRun(accountId) {
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

  const alreadyRunning = await prisma.pipelineRun.findFirst({
    where: { account_id: account.id, status: 'running' },
  });
  if (alreadyRunning) {
    const error = new Error('A pipeline is already running for this account');
    error.status = 409;
    throw error;
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
  let child;
  try {
    child = spawn(bunBin, ['pipeline-runner.js', account.id, run.id], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: process.env,
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
