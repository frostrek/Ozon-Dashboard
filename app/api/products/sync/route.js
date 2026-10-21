import { exec, execSync } from 'child_process';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { ozonPauseReason } from '../../../../ozon-http.js';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const STATUS_FILE = path.join(PROJECT_ROOT, 'runs', 'product-sync-status.json');

export const dynamic = 'force-dynamic';

function getRunner() {
  try {
    execSync('bun --version', { stdio: 'ignore' });
    return 'bun';
  } catch {
    return 'node';
  }
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return { running: false, saved: 0, message: '' };
  }
}

export async function GET() {
  return NextResponse.json(readStatus());
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || '');
  const current = readStatus();
  if (current.running) {
    return NextResponse.json({ error: 'A product sync is already running.', ...current }, { status: 409 });
  }

  const accounts = await prisma.account.findMany({
    where: accountId ? { id: accountId, active: true } : { active: true },
    select: { id: true, name: true, client_id: true },
  });
  if (!accounts.length) return NextResponse.json({ error: 'Choose a seller account.' }, { status: 400 });

  const open = accounts.filter((account) => !ozonPauseReason(account.client_id));
  if (!open.length) {
    return NextResponse.json({ error: ozonPauseReason(accounts[0].client_id) }, { status: 429 });
  }

  const runner = getRunner();
  const runnerPath = path.join(PROJECT_ROOT, 'product-sync.js');
  const target = accountId ? open[0].id : '';
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify({
    running: true,
    saved: 0,
    accountName: open.map((account) => account.name).join(', '),
    message: 'Starting product sync.',
    updatedAt: new Date().toISOString(),
  }));

  const command = target
    ? `"${runner}" "${runnerPath}" ${target}`
    : `"${runner}" "${runnerPath}"`;
  exec(command, { cwd: PROJECT_ROOT }, (error) => {
    if (error) console.error('[product-sync]', error.message);
  });

  return NextResponse.json({ status: 'syncing', accounts: open.map((account) => account.name) });
}
