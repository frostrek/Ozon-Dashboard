import { prisma } from '../prisma';
import { withCache } from '../cache/upstash';
import { whichRunFilesExist } from '../pipeline/runFileStore';
import { accountNamesById } from '../accountNames';

export const REPORT_PAGE_SIZE = 25;

export async function reportsSummaryStats() {
  const key = 'reports:stats:summary:v2';
  const load = async () => {
    const [total, successCount, ordersAgg] = await Promise.all([
      prisma.report.count(),
      prisma.report.count({ where: { status: 'success' } }),
      prisma.report.aggregate({ _sum: { orders_processed: true } }),
    ]);
    const totalOrders = ordersAgg._sum.orders_processed || 0;
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 100;
    return {
      total,
      successCount,
      totalOrders,
      successRate,
    };
  };
  try {
    return await withCache(key, 60, load);
  } catch {
    return load();
  }
}

export async function listReportsPage({ page = 1, pageSize = REPORT_PAGE_SIZE, account = 'all', status = 'all', q = '' } = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || REPORT_PAGE_SIZE));
  const current = Math.max(1, Number(page) || 1);
  const where = {};
  if (account && account !== 'all') where.account_id = account;
  if (status && status !== 'all') where.status = status;

  const needle = String(q || '').trim();
  if (needle) {
    const matchingAccounts = await prisma.account.findMany({
      where: { name: { contains: needle, mode: 'insensitive' } },
      select: { id: true },
    });
    const accIds = matchingAccounts.map((a) => a.id);
    where.OR = [
      ...(accIds.length > 0 ? [{ account_id: { in: accIds } }] : []),
      { status: { contains: needle, mode: 'insensitive' } },
    ];
  }

  const key = `reports:v5:${account}:${status}:${needle.toLowerCase()}:p${current}:s${size}`;

  const load = async () => {
    const total = await prisma.report.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / size));
    if (current > pageCount || total === 0) {
      return { reports: [], total, page: current, pageSize: size, pageCount, hasMore: false };
    }
    const rows = await prisma.report.findMany({
      where,
      select: {
        id: true,
        created_at: true,
        account_id: true,
        orders_processed: true,
        status: true,
        pdf_url: true,
        excel_url: true,
      },
      orderBy: { created_at: 'desc' },
      skip: (current - 1) * size,
      take: size,
    });
    const names = await accountNamesById(rows.map((report) => report.account_id));
    const rels = rows.flatMap((report) => [report.pdf_url, report.excel_url].filter(Boolean).map((url) => url.replace(/^\//, '')));
    const existing = await whichRunFilesExist(rels);
    return {
      reports: rows.map((report) => {
        const pdfRel = report.pdf_url ? report.pdf_url.replace(/^\//, '') : '';
        const excelRel = report.excel_url ? report.excel_url.replace(/^\//, '') : '';
        const pdfUrl = pdfRel && existing.has(pdfRel) ? report.pdf_url : null;
        const excelUrl = excelRel && existing.has(excelRel) ? report.excel_url : null;
        return {
          id: report.id,
          createdAt: report.created_at,
          accountName: names[report.account_id] || '—',
          ordersProcessed: report.orders_processed,
          status: report.status,
          pdfUrl,
          excelUrl,
          filesMissing: Boolean((pdfRel || excelRel) && !pdfUrl && !excelUrl),
        };
      }),
      total,
      page: current,
      pageSize: size,
      pageCount,
      hasMore: current * size < total,
    };
  };
  try {
    return await withCache(key, 45, load);
  } catch {
    return load();
  }
}
