import { listLogRunsPage, LOG_PAGE_SIZE } from '../../lib/logs/listLogs';
import LogsClient from './LogsClient';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
  let loadError = '';
  let data = { runs: [], total: 0 };
  try {
    data = await listLogRunsPage({ page: 1, pageSize: LOG_PAGE_SIZE });
  } catch (error) {
    loadError = error?.message || 'Logs could not be loaded.';
  }

  if (loadError) {
    return (
      <div className="logs-page">
        <p className="notice notice-error" role="alert">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="logs-page">
      <LogsClient initialRuns={data.runs} total={data.total} />
    </div>
  );
}
