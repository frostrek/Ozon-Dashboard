'use client';

import { useEffect, useState } from 'react';

const EMPTY = {
  telegram_bot_token_set: false,
  telegram_bot_token_masked: '',
  telegram_chat_ids: '',
  notify_on_dashboard_runs: false,
  translation_provider: 'google',
  grok_api_key_set: false,
  grok_api_key_masked: '',
};

export default function SettingsClient() {
  const [form, setForm] = useState(EMPTY);
  const [token, setToken] = useState('');
  const [grokKey, setGrokKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings/app', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load settings');
        setForm({ ...EMPTY, ...data });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/settings/app', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_bot_token: token,
          telegram_chat_ids: form.telegram_chat_ids,
          notify_on_dashboard_runs: form.notify_on_dashboard_runs,
          translation_provider: form.translation_provider,
          grok_api_key: grokKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save settings');
      setForm({ ...EMPTY, ...data });
      setToken('');
      setGrokKey('');
      setMessage('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="page-lead">Loading settings...</p>;
  }

  return (
    <div>
      <header className="page-head">
        <h1>Settings</h1>
        <p className="page-lead">
          Ozon API keys are managed on the Accounts page. These options are for Telegram and translation. The command-line pipeline still reads its own .env file.
        </p>
      </header>

      <form onSubmit={save} className="stat-card stack">
        <div>
          <p className="section-label">Telegram</p>
          <p className="field-help">Used only when dashboard notifications are turned on.</p>
        </div>

        <label className="field">
          <span className="field-label">Telegram bot token</span>
          <span className="field-help">Leave blank to keep the saved token. It is never shown in full.</span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            placeholder={form.telegram_bot_token_set ? `Saved (${form.telegram_bot_token_masked})` : 'Paste a bot token'}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Telegram chat IDs</span>
          <span className="field-help">Comma-separated numbers. Group chats can be negative.</span>
          <textarea
            value={form.telegram_chat_ids}
            placeholder="123456789, -100987654321"
            onChange={(event) => setForm({ ...form, telegram_chat_ids: event.target.value })}
            rows={3}
          />
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={form.notify_on_dashboard_runs}
            onChange={(event) => setForm({ ...form, notify_on_dashboard_runs: event.target.checked })}
          />
          <span>Send Telegram notification when a dashboard pipeline finishes</span>
        </label>

        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
          <p className="section-label">Translation</p>
          <p className="field-help">Used when generating thermal labels.</p>
        </div>

        <label className="field">
          <span className="field-label">Translation provider</span>
          <span className="field-help">Google is the default. Grok is used only when a key is saved.</span>
          <select
            value={form.translation_provider}
            onChange={(event) => setForm({ ...form, translation_provider: event.target.value })}
          >
            <option value="google">Google</option>
            <option value="grok">Grok</option>
          </select>
        </label>

        {form.translation_provider === 'grok' && (
          <label className="field">
            <span className="field-label">Grok API key</span>
            <span className="field-help">Leave blank to keep the saved key.</span>
            <input
              type="password"
              autoComplete="off"
              value={grokKey}
              placeholder={form.grok_api_key_set ? `Saved (${form.grok_api_key_masked})` : 'Paste a Grok API key'}
              onChange={(event) => setGrokKey(event.target.value)}
            />
          </label>
        )}

        <div>
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
        {message && <p className="notice notice-ok">{message}</p>}
        {error && <p className="notice notice-error">{error}</p>}
      </form>
    </div>
  );
}
