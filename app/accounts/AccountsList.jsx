'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import DeleteAccount from './DeleteAccount';

export default function AccountsList({ rows, deleteAction }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!needle) return rows;
    return rows.filter((account) => (
      account.name.toLowerCase().includes(needle)
      || account.clientId.toLowerCase().includes(needle)
    ));
  }, [needle, rows]);

  return (
    <section className="accounts-table-card">
      <div className="accounts-table-head">
        <div>
          <h2>Connected Accounts</h2>
          <p>Overview of all connected Ozon accounts.</p>
        </div>
        <label className="accounts-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or client ID"
            aria-label="Search accounts"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="accounts-empty">
          <h3>No accounts yet</h3>
          <p>Add a seller account above to connect Ozon and run the pipeline.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="accounts-empty">
          <h3>No accounts match</h3>
          <p>Nothing matches “{query.trim()}”. Try another name or client ID.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="accounts-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Account</th>
                <th>Client ID</th>
                <th>Connection</th>
                <th>Last sync</th>
                <th>Orders today</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((account, index) => (
                <tr key={account.id}>
                  <td className="accounts-index">{index + 1}</td>
                  <td>
                    <div className="accounts-identity">
                      <span className="accounts-mark" aria-hidden="true">Oz</span>
                      <span>
                        <strong>{account.name}</strong>
                        <small>Ozon seller account</small>
                      </span>
                    </div>
                  </td>
                  <td className="accounts-client">{account.clientId}</td>
                  <td>
                    <span className={account.active ? 'accounts-badge is-on' : 'accounts-badge'}>
                      {account.active ? 'Connected' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <span className="accounts-sync">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>
                      {account.lastSync}
                    </span>
                  </td>
                  <td className="accounts-orders">{account.ordersToday}</td>
                  <td>
                    <div className="accounts-actions">
                      <Link
                        className={`accounts-run${account.running ? ' is-busy' : ''}`}
                        href={`/pipeline?accountId=${account.id}`}
                        aria-disabled={account.running ? 'true' : undefined}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                        {account.running ? 'Running' : 'Run'}
                      </Link>
                      <DeleteAccount action={deleteAction} id={account.id} name={account.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
