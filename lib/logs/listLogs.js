import { prisma } from '../prisma';
import { withCache } from '../cache/upstash';

export const LOG_PAGE_SIZE = 100;

export async function listLogRunsPage({ page = 1, pageSize = LOG_PAGE_SIZE } = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || LOG_PAGE_SIZE));
  const current = Math.max(1, Number(page) || 1);
  const key = `logs:v1:p${current}:s${size}`;

  return withCache(key, 45, async () => {
    const total = await prisma.pipelineRun.count();
    const pageCount = Math.max(1, Math.ceil(total / size));
    if (current > pageCount || total === 0) {
      return { runs: [], total, page: current, pageSize: size, pageCount, hasMore: false };
    }
    const runs = await prisma.pipelineRun.findMany({
      include: { account: { select: { name: true } } },
      orderBy: { start_time: 'desc' },
      skip: (current - 1) * size,
      take: size,
    });
    return {
      runs: runs.map((run) => ({
        id: run.id,
        accountName: run.account?.name || 'Unknown account',
        startTime: run.start_time,
        cancelled: run.cancelled,
        status: run.status,
        logExcerpt: run.log_excerpt || run.error_message || '',
      })),
      total,
      page: current,
      pageSize: size,
      pageCount,
      hasMore: current * size < total,
    };
  });
}
