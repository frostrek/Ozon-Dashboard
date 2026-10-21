'use client';

export default function ImportReport({ report, busy, onRetry, onClose }) {
  if (!report && !busy) return null;
  const failed = (report?.results || []).filter((row) => row.status === 'failed' && row.productId);
  return (
    <section className="prod-report" aria-live="polite">
      <div className="prod-report-head">
        <h2>{busy ? 'Sending products to Ozon' : 'Ozon import'}</h2>
        {report && (
          <p>
            {report.success} succeeded · {report.pending} pending · {report.failed} failed · {report.total} total
          </p>
        )}
        {busy && !report && <p>Waiting for Ozon. A failed row will not stop the rest.</p>}
        <button type="button" className="dash-outline" onClick={onClose} disabled={busy}>Close</button>
      </div>
      {report?.error && <p className="notice notice-error" role="alert">{report.error}</p>}
      {!!report?.results?.length && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Offer</th>
                <th>Status</th>
                <th>Action</th>
                <th>Task</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((row, index) => (
                <tr key={`${row.offerId}-${index}`}>
                  <td>{row.offerId || '—'}</td>
                  <td>{row.status}</td>
                  <td>{row.action || '—'}</td>
                  <td>{row.taskId || '—'}</td>
                  <td>{row.error || row.warning || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {failed.length > 0 && (
        <button type="button" className="dash-primary" onClick={onRetry} disabled={busy}>
          Retry failed ({failed.length})
        </button>
      )}
    </section>
  );
}
