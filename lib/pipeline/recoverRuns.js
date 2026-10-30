import { prisma } from '../prisma';
import { killProcessTree } from './killTree';

const STALE_MS = 20 * 60 * 1000;

function pidAlive(pid) {
  const id = Number(pid);
  if (!Number.isFinite(id) || id <= 0) return false;
  try {
    process.kill(id, 0);
    return true;
  } catch {
    return false;
  }
}

function isStaleRun(run) {
  const started = run.start_time ? new Date(run.start_time).getTime() : 0;
  const age = Date.now() - started;
  if (run.pid && pidAlive(run.pid)) return false;
  if (age >= STALE_MS) return true;
  if (!run.pid && age >= 60_000) return true;
  return false;
}

export async function recoverStaleRuns() {
  const running = await prisma.pipelineRun.findMany({
    where: { status: 'running' },
    select: { id: true, pid: true, start_time: true },
  });
  for (const run of running) {
    if (!isStaleRun(run)) continue;
    if (run.pid) {
      await killProcessTree(run.pid).catch(() => {});
    }
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        stage: 'failed',
        error_message: 'This run stopped responding and was cleared so you can start again.',
        end_time: new Date(),
        pid: null,
      },
    });
  }
}
