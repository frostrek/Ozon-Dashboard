import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { prisma } from '../prisma';
import { killProcessTree } from './killTree';

function pipelineProcessAlive(pid) {
  const id = Number(pid);
  if (!Number.isFinite(id) || id <= 0) return false;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${id}").CommandLine`],
        { encoding: 'utf8', timeout: 5000 },
      );
      return /pipeline-runner/.test(out || '');
    }
    const cmd = readFileSync(`/proc/${id}/cmdline`, 'utf8');
    return cmd.includes('pipeline-runner');
  } catch {
    return false;
  }
}

const MAX_RUN_MS = 40 * 60 * 1000;

export async function recoverStaleRuns() {
  const running = await prisma.pipelineRun.findMany({
    where: { status: 'running' },
    select: { id: true, pid: true, start_time: true },
  });
  for (const run of running) {
    const alive = pipelineProcessAlive(run.pid);
    const age = Date.now() - new Date(run.start_time || 0).getTime();
    if (alive && age < MAX_RUN_MS) continue;
    if (run.pid) await killProcessTree(run.pid).catch(() => {});
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        stage: 'failed',
        error_message: alive
          ? 'This run was stopped because it ran too long. Start it again — packing orders no longer scans the full product catalog.'
          : 'This run was not actually running, so it was cleared. Start the pipeline again.',
        end_time: new Date(),
        pid: null,
      },
    });
  }
}
