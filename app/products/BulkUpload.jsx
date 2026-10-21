'use client';

import { useState } from 'react';

export default function BulkUpload({ accounts, onClose, onReport }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [file, setFile] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    if (!file) {
      setError('Choose a CSV or Excel file.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const body = new FormData();
      body.set('accountId', accountId);
      body.set('file', file);
      const res = await fetch('/api/products/import/file', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.results) throw new Error(data.error || 'The file could not be imported.');
      onReport(data.error ? { ...data, results: data.results || [] } : data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="confirm-backdrop" onClick={() => { if (!pending) onClose(); }}>
      <form className="confirm-card prod-add" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <h2>Upload products to Ozon</h2>
        <p>CSV or Excel. One failed row does not stop the rest of the file.</p>
        <label className="field">
          <span className="field-label">Account</span>
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
            {accounts.length === 0 && <option value="">No accounts yet</option>}
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">File</span>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
        </label>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="dash-outline" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" className="dash-primary" disabled={pending || accounts.length === 0}>
            {pending ? 'Uploading...' : 'Upload to Ozon'}
          </button>
        </div>
      </form>
    </div>
  );
}
