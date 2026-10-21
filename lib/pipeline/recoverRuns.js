import { prisma } from '../prisma';
import { killProcessTree } from './killTree';

export function recoverStaleRuns() {
  if (!globalThis.__pipelineRecovered) {
    globalThis.__pipelineRecovered = (async () => {
      const stale = await prisma.pipelineRun.findMany({
        where: { status: 'running' },
        select: { id: true, pid: true },
      });
      for (const run of stale) {
        if (run.pid) {
          await killProcessTree(run.pid).catch(() => {});
        }
        await prisma.pipelineRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            stage: 'failed',
            error_message: 'server restarted',
            end_time: new Date(),
            pid: null,
          },
        });
      }
    })().catch((err) => {
      globalThis.__pipelineRecovered = null;
      console.error('[pipeline] stale run cleanup failed:', err.message);
    });
  }
  return globalThis.__pipelineRecovered;
}
