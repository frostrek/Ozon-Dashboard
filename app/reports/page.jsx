import { listReportsPage, REPORT_PAGE_SIZE } from '../../lib/reports/listReports';
import ReportsClient from './ReportsClient';
import { toPlain } from '../../lib/toPlain';
import FriendlyError from '../components/FriendlyError';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  try {
    const data = await listReportsPage({ page: 1, pageSize: REPORT_PAGE_SIZE });
    return (
      <div>
        <header className="page-head">
          <h1>Reports</h1>
          <p className="page-lead">PDFs and Excel files from finished pipeline runs. Live logs are on the Pipeline page.</p>
        </header>
        <ReportsClient initialReports={toPlain(data.reports) || []} total={Number(data.total) || 0} />
      </div>
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
