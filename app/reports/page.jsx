import { listReportsPage, REPORT_PAGE_SIZE } from '../../lib/reports/listReports';
import ReportsClient from './ReportsClient';
import { prisma } from '../../lib/prisma';
import { toPlain } from '../../lib/toPlain';
import FriendlyError from '../components/FriendlyError';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  try {
    const [data, accountRows] = await Promise.all([
      listReportsPage({ page: 1, pageSize: REPORT_PAGE_SIZE }),
      prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return (
      <ReportsClient
        initialReports={toPlain(data.reports) || []}
        total={Number(data.total) || 0}
        accounts={toPlain(accountRows) || []}
      />
    );
  } catch (error) {
    console.error('[reports-page]', error);
    return (
      <FriendlyError
        kind="page"
        message="Reports could not be loaded from the database."
        digest={error?.digest ? String(error.digest) : ''}
      />
    );
  }
}
