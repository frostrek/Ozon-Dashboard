import { prisma } from '../../lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const reports = await prisma.report.findMany({
    include: { account: true },
    orderBy: { created_at: 'desc' }
  });

  return (
    <div>
      <header className="page-head">
        <h1>Reports</h1>
        <p className="page-lead">PDFs and Excel files from finished pipeline runs. Live logs are on the Pipeline page.</p>
      </header>
      <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th>Orders</th>
            <th>Status</th>
            <th>Files</th>
          </tr>
        </thead>
        <tbody>
          {reports.length === 0 && (
            <tr><td colSpan="5" className="empty-cell">No reports yet. Finish a pipeline run to create one.</td></tr>
          )}
          {reports.map(report => (
            <tr key={report.id}>
              <td>{new Date(report.created_at).toLocaleString()}</td>
              <td>{report.account?.name || '—'}</td>
              <td>{report.orders_processed}</td>
              <td><span className={`badge ${report.status === 'success' ? 'badge-success' : report.status === 'failed' ? 'badge-error' : 'badge-info'}`}>{report.status || 'saved'}</span></td>
              <td>
                  {report.pdf_url ? <a className="file-link" href={`/api/download?file=${report.pdf_url.replace(/^\//, '')}`}>Download PDF</a> : null}
                  {report.excel_url ? <a className="file-link" href={`/api/download?file=${report.excel_url.replace(/^\//, '')}`}>Download Excel</a> : null}
                  {!report.pdf_url && !report.excel_url && '—'}
                  <Link className="file-link" href="/logs">View logs</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
