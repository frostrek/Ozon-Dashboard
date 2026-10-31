import { prisma } from '../prisma';
import { withCache } from '../cache/upstash';

export const REPORT_PAGE_SIZE = 100;

export async function listReportsPage({ page = 1, pageSize = REPORT_PAGE_SIZE } = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || REPORT_PAGE_SIZE));
  const current = Math.max(1, Number(page) || 1);
  const key = `reports:v1:p${current}:s${size}`;

  return withCache(key, 45, async () => {
    const total = await prisma.report.count();
    const pageCount = Math.max(1, Math.ceil(total / size));
    if (current > pageCount || total === 0) {
      return { reports: [], total, page: current, pageSize: size, pageCount, hasMore: false };
    }
    const rows = await prisma.report.findMany({
      include: { account: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
      skip: (current - 1) * size,
      take: size,
    });
    return {
      reports: rows.map((report) => ({
        id: report.id,
        createdAt: report.created_at,
        accountName: report.account?.name || '—',
        ordersProcessed: report.orders_processed,
        status: report.status,
        pdfUrl: report.pdf_url,
        excelUrl: report.excel_url,
      })),
      total,
      page: current,
      pageSize: size,
      pageCount,
      hasMore: current * size < total,
    };
  });
}
