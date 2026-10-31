'use client';

import Link from 'next/link';
import ListPager from '../components/ListPager';
import { FETCH_SIZE, UI_BATCH, useBatchScroll } from '../hooks/useBatchScroll';

export default function ReportsClient({ initialReports, total }) {
  const scroll = useBatchScroll({
    initialItems: initialReports,
    initialTotal: total,
    resetKey: 'reports',
    itemKey: 'id',
    pageMode: true,
    loadPage: async (page) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(FETCH_SIZE) });
      const response = await fetch(`/api/reports?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Reports could not be loaded.');
      return { items: data.reports || [], total: Number(data.total) || 0 };
    },
  });

  return (
    <>
      {scroll.loading ? <p className="page-lead">Loading reports…</p> : null}
      {scroll.error ? (
        <p className="notice notice-error" role="alert">
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>Retry</button>
        </p>
      ) : null}
      <div className="table-wrap" ref={scroll.tableWrapRef}>
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
            {scroll.items.length === 0 ? (
              <tr><td colSpan="5" className="empty-cell">No reports yet. Finish a pipeline run to create one.</td></tr>
            ) : scroll.items.map((report) => (
              <tr key={report.id}>
                <td>{new Date(report.createdAt).toLocaleString()}</td>
                <td>{report.accountName}</td>
                <td>{report.ordersProcessed}</td>
                <td><span className={`badge ${report.status === 'success' ? 'badge-success' : report.status === 'failed' ? 'badge-error' : 'badge-info'}`}>{report.status || 'saved'}</span></td>
                <td>
                  {report.pdfUrl ? <a className="file-link" href={`/api/download?file=${report.pdfUrl.replace(/^\//, '')}`}>Download PDF</a> : null}
                  {report.excelUrl ? <a className="file-link" href={`/api/download?file=${report.excelUrl.replace(/^\//, '')}`}>Download Excel</a> : null}
                  {report.filesMissing ? <span className="muted">Files were on the server disk and are gone after a deploy. Run the pipeline again to keep a copy.</span> : null}
                  {!report.pdfUrl && !report.excelUrl && !report.filesMissing && '—'}
                  <Link className="file-link" href="/logs">View logs</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scroll.total > 0 ? (
        <ListPager
          label="Report pages"
          page={scroll.currentPage}
          pageCount={scroll.pageCount}
          start={scroll.rangeStart}
          end={scroll.rangeEnd}
          total={scroll.total}
          pageSize={UI_BATCH}
          noun="reports"
          onPage={scroll.goToPage}
        />
      ) : null}
    </>
  );
}
