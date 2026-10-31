import { listReportsPage, REPORT_PAGE_SIZE } from '../../lib/reports/listReports';
import ReportsClient from './ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const data = await listReportsPage({ page: 1, pageSize: REPORT_PAGE_SIZE });

  return (
    <div>
      <header className="page-head">
        <h1>Reports</h1>
        <p className="page-lead">PDFs and Excel files from finished pipeline runs. Live logs are on the Pipeline page.</p>
      </header>
      <ReportsClient initialReports={data.reports} total={data.total} />
    </div>
  );
}
