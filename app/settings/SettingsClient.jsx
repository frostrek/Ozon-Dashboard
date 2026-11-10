'use client';

import { useEffect, useState } from 'react';
import TypeSelect from '../components/TypeSelect';

const EMPTY_APP = {
  telegram_bot_token_set: false,
  telegram_bot_token_masked: '',
  telegram_chat_ids: '',
  notify_on_dashboard_runs: false,
  translation_provider: 'google',
  grok_api_key_set: false,
  grok_api_key_masked: '',
};

const DEFAULT_AI = {
  min_margin_pct: 15.0,
  min_match_confidence: 90,
  min_seo_score: 80,
  min_content_rating: 85,
  price_protection_pct: 5.0,
  auto_retry_count: 3,
  queue_concurrency: 50,
  groq_model: 'llama3-70b-8192',
  google_vision_model: 'gemini-1.5-pro-latest',
  amazon_scan_freq_hours: 168,
  competitor_scan_freq_hours: 24,
};

function RealisticTelegramIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="settings-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="tgGrad" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="50%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <filter id="tgGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0284C7" floodOpacity="0.3" />
        </filter>
      </defs>
      <g filter="url(#tgGlow)">
        <circle cx="24" cy="24" r="18" fill="url(#tgGrad)" />
        <circle cx="24" cy="24" r="15" stroke="#BAE6FD" strokeWidth="1.2" opacity="0.6" fill="none" />
        <path d="M12 21C13.5 15 18 11 24 11C30 11 34.5 15 36 21C32 17.5 28 16 24 16C20 16 16 17.5 12 21Z" fill="#FFFFFF" opacity="0.35" />
        <path d="M13 23.5L34 15.5L30 33L24 28L21 31V26L31 18L18 25L13 23.5Z" fill="#FFFFFF" />
      </g>
    </svg>
  );
}

function RealisticTranslationIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="settings-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="transGrad" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="50%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
        <filter id="transGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F766E" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter="url(#transGlow)">
        <circle cx="24" cy="24" r="18" fill="url(#transGrad)" />
        <circle cx="24" cy="24" r="14.5" stroke="#CCFBF1" strokeWidth="1.5" opacity="0.75" fill="none" />
        <ellipse cx="24" cy="24" rx="8" ry="17.5" stroke="#CCFBF1" strokeWidth="1.2" opacity="0.65" fill="none" />
        <line x1="7" y1="24" x2="41" y2="24" stroke="#CCFBF1" strokeWidth="1.2" opacity="0.65" />
        <line x1="10" y1="17" x2="38" y2="17" stroke="#CCFBF1" strokeWidth="1" opacity="0.5" />
        <line x1="10" y1="31" x2="38" y2="31" stroke="#CCFBF1" strokeWidth="1" opacity="0.5" />
        <path d="M13 20C14.5 14.5 18.8 11 24 11C29.2 11 33.5 14.5 35 20C31 17 27 16 24 16C20.5 16 16.5 17.2 13 20Z" fill="#FFFFFF" opacity="0.35" />
      </g>
    </svg>
  );
}

function RealisticAIIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="settings-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="aiGrad" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#6D28D9" />
        </linearGradient>
        <filter id="aiGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#7C3AED" floodOpacity="0.3" />
        </filter>
      </defs>
      <g filter="url(#aiGlow)">
        <rect x="12" y="12" width="24" height="24" rx="6" fill="url(#aiGrad)" />
        <rect x="15" y="15" width="18" height="18" rx="3" stroke="#DDD6FE" strokeWidth="1.5" opacity="0.8" fill="none" />
        <circle cx="24" cy="24" r="4" fill="#FFFFFF" />
        <line x1="6" y1="19" x2="12" y2="19" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <line x1="6" y1="29" x2="12" y2="29" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <line x1="36" y1="19" x2="42" y2="19" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <line x1="36" y1="29" x2="42" y2="29" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <line x1="19" y1="6" x2="19" y2="12" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <line x1="29" y1="6" x2="29" y2="12" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <line x1="19" y1="36" x2="19" y2="42" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <line x1="29" y1="36" x2="29" y2="42" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default function SettingsClient() {
  const [activeTab, setActiveTab] = useState('notifications');
  const [appForm, setAppForm] = useState(EMPTY_APP);
  const [aiForm, setAiForm] = useState(DEFAULT_AI);

  const [token, setToken] = useState('');
  const [grokKey, setGrokKey] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showGrokKey, setShowGrokKey] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/app', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ])
      .then(([appData, aiData]) => {
        if (appData && !appData.error) {
          setAppForm({ ...EMPTY_APP, ...appData });
        }
        if (aiData && !aiData.error) {
          setAiForm({ ...DEFAULT_AI, ...aiData });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function saveApp(event) {
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
          telegram_chat_ids: appForm.telegram_chat_ids,
          notify_on_dashboard_runs: appForm.notify_on_dashboard_runs,
          translation_provider: appForm.translation_provider,
          grok_api_key: grokKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save settings');
      setAppForm({ ...EMPTY_APP, ...data });
      setToken('');
      setGrokKey('');
      setMessage('Settings saved successfully.');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAI(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const body = {
        min_margin_pct: parseFloat(aiForm.min_margin_pct) || 0,
        min_match_confidence: parseInt(aiForm.min_match_confidence, 10) || 0,
        min_seo_score: parseInt(aiForm.min_seo_score, 10) || 0,
        min_content_rating: parseInt(aiForm.min_content_rating, 10) || 0,
        price_protection_pct: parseFloat(aiForm.price_protection_pct) || 0,
        auto_retry_count: parseInt(aiForm.auto_retry_count, 10) || 0,
        queue_concurrency: parseInt(aiForm.queue_concurrency, 10) || 0,
        groq_model: aiForm.groq_model || 'llama3-70b-8192',
        google_vision_model: aiForm.google_vision_model || 'gemini-1.5-pro-latest',
        amazon_scan_freq_hours: parseInt(aiForm.amazon_scan_freq_hours, 10) || 168,
        competitor_scan_freq_hours: parseInt(aiForm.competitor_scan_freq_hours, 10) || 24,
      };

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save AI settings');
      setAiForm({ ...DEFAULT_AI, ...data });
      setMessage('AI and pipeline settings saved successfully.');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-page">
        <header className="settings-hero">
          <div>
            <h1>Settings</h1>
          </div>
        </header>
        <p className="page-lead">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <header className="settings-hero">
        <div>
          <h1>Settings</h1>
        </div>
      </header>

      {/* Tabs Navigator */}
      <nav className="settings-tabs" aria-label="Settings sections">
        <button
          type="button"
          className={`settings-tab-btn${activeTab === 'notifications' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          <span className="settings-tab-icon-wrap">
            <RealisticTelegramIcon />
          </span>
          <div className="settings-tab-copy">
            <span className="settings-tab-title">Notifications</span>
            <span className="settings-tab-desc">Telegram alerts & bots</span>
          </div>
        </button>

        <button
          type="button"
          className={`settings-tab-btn${activeTab === 'translation' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('translation')}
        >
          <span className="settings-tab-icon-wrap">
            <RealisticTranslationIcon />
          </span>
          <div className="settings-tab-copy">
            <span className="settings-tab-title">Translation</span>
            <span className="settings-tab-desc">Google & Grok engines</span>
          </div>
        </button>

        <button
          type="button"
          className={`settings-tab-btn${activeTab === 'ai' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <span className="settings-tab-icon-wrap">
            <RealisticAIIcon />
          </span>
          <div className="settings-tab-copy">
            <span className="settings-tab-title">AI & Automation</span>
            <span className="settings-tab-desc">Thresholds, LLM & scans</span>
          </div>
        </button>
      </nav>

      {/* TAB 1: Telegram Notifications */}
      {activeTab === 'notifications' && (
        <form onSubmit={saveApp} className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-head-left">
              <span className="settings-head-badge">
                <RealisticTelegramIcon />
              </span>
              <div>
                <h2>Telegram Notifications</h2>
                <p>Configure automated pipeline completion alerts and diagnostic messages sent to your Telegram channels or groups.</p>
              </div>
            </div>
            <div className="settings-card-head-right">
              {appForm.telegram_bot_token_set ? (
                <span className="settings-status-pill is-ok">
                  <span className="settings-status-dot" />
                  Bot Connected
                </span>
              ) : (
                <span className="settings-status-pill is-empty">
                  <span className="settings-status-dot" />
                  Not Configured
                </span>
              )}
            </div>
          </div>

          <div className="settings-grid">
            <div className="settings-field-group">
              <label className="settings-label" htmlFor="tg-token">
                Telegram Bot Token
              </label>
              <p className="settings-help">Create a bot via @BotFather and paste its authentication token here.</p>
              <div className="settings-input-wrap">
                <input
                  id="tg-token"
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  className="settings-input"
                  value={token}
                  placeholder={appForm.telegram_bot_token_set ? `Saved (${appForm.telegram_bot_token_masked})` : 'e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ'}
                  onChange={(e) => setToken(e.target.value)}
                />
                <button
                  type="button"
                  className="settings-input-toggle"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="settings-field-group">
              <label className="settings-label" htmlFor="tg-chats">
                Telegram Chat IDs
              </label>
              <p className="settings-help">Comma-separated target chat or channel IDs (e.g. 123456789, -100987654321 for groups).</p>
              <textarea
                id="tg-chats"
                className="settings-textarea"
                rows={3}
                value={appForm.telegram_chat_ids}
                placeholder="123456789, -100987654321"
                onChange={(e) => setAppForm({ ...appForm, telegram_chat_ids: e.target.value })}
              />
            </div>

            <div className="settings-switch-card">
              <label className="settings-switch-wrap">
                <input
                  type="checkbox"
                  className="settings-switch-input"
                  checked={appForm.notify_on_dashboard_runs}
                  onChange={(e) => setAppForm({ ...appForm, notify_on_dashboard_runs: e.target.checked })}
                />
                <span className="settings-switch-slider" />
              </label>
              <div className="settings-switch-text">
                <strong>Send Telegram notification when a pipeline completes</strong>
                <p>Broadcasts an automated run report including order counts, financial totals, and any failure warnings.</p>
              </div>
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="dash-primary settings-submit-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {message && <span className="settings-notice is-ok">{message}</span>}
            {error && <span className="settings-notice is-bad">{error}</span>}
          </div>
        </form>
      )}

      {/* TAB 2: Translation Service */}
      {activeTab === 'translation' && (
        <form onSubmit={saveApp} className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-head-left">
              <span className="settings-head-badge">
                <RealisticTranslationIcon />
              </span>
              <div>
                <h2>Translation & Localization</h2>
                <p>Configure the machine translation engine used for English-to-Russian catalog generation and Russian-to-English shipping label translations.</p>
              </div>
            </div>
            <div className="settings-card-head-right">
              <span className="settings-status-pill is-provider">
                Provider: {appForm.translation_provider === 'grok' ? 'xAI Grok' : 'Google Translate'}
              </span>
            </div>
          </div>

          <div className="settings-grid">
            <div className="settings-field-group">
              <label className="settings-label">Active Translation Provider</label>
              <p className="settings-help">Google Translate works with zero configuration. xAI Grok provides high-context e-commerce translations.</p>
              <div className="settings-type-select-wrap">
                <TypeSelect
                  label="Translation provider"
                  value={appForm.translation_provider}
                  options={[
                    { id: 'google', label: 'Google Translate (Standard)' },
                    { id: 'grok', label: 'xAI Grok (Requires API Key)' },
                  ]}
                  onChange={(next) => setAppForm({ ...appForm, translation_provider: next })}
                />
              </div>
            </div>

            {appForm.translation_provider === 'grok' && (
              <div className="settings-field-group">
                <label className="settings-label" htmlFor="grok-key">
                  xAI Grok API Key
                </label>
                <p className="settings-help">Leave blank to retain your existing saved key. Your key is securely encrypted.</p>
                <div className="settings-input-wrap">
                  <input
                    id="grok-key"
                    type={showGrokKey ? 'text' : 'password'}
                    autoComplete="off"
                    className="settings-input"
                    value={grokKey}
                    placeholder={appForm.grok_api_key_set ? `Saved (${appForm.grok_api_key_masked})` : 'Paste your xAI Grok API Key (xai-...)'}
                    onChange={(e) => setGrokKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="settings-input-toggle"
                    onClick={() => setShowGrokKey(!showGrokKey)}
                    title={showGrokKey ? 'Hide key' : 'Show key'}
                  >
                    {showGrokKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="settings-actions">
            <button type="submit" className="dash-primary settings-submit-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {message && <span className="settings-notice is-ok">{message}</span>}
            {error && <span className="settings-notice is-bad">{error}</span>}
          </div>
        </form>
      )}

      {/* TAB 3: AI & Automation Engine */}
      {activeTab === 'ai' && (
        <form onSubmit={saveAI} className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-head-left">
              <span className="settings-head-badge">
                <RealisticAIIcon />
              </span>
              <div>
                <h2>AI & Automation Parameters</h2>
                <p>Calibrate profit margins, matching confidence, LLM models, and background execution frequencies.</p>
              </div>
            </div>
            <div className="settings-card-head-right">
              <span className="settings-status-pill is-ok">
                Engine Active
              </span>
            </div>
          </div>

          <div className="settings-subhead">
            <h3>Quality & Margin Thresholds</h3>
          </div>

          <div className="settings-form-row">
            <div className="settings-field-group">
              <label className="settings-label" htmlFor="min_margin">
                Minimum Margin %
              </label>
              <p className="settings-help">Products below this margin are flagged critical.</p>
              <input
                id="min_margin"
                type="number"
                step="0.5"
                className="settings-input"
                value={aiForm.min_margin_pct}
                onChange={(e) => setAiForm({ ...aiForm, min_margin_pct: e.target.value })}
              />
            </div>

            <div className="settings-field-group">
              <label className="settings-label" htmlFor="min_match">
                Min Match Confidence %
              </label>
              <p className="settings-help">Amazon-to-Ozon matching threshold.</p>
              <input
                id="min_match"
                type="number"
                className="settings-input"
                value={aiForm.min_match_confidence}
                onChange={(e) => setAiForm({ ...aiForm, min_match_confidence: e.target.value })}
              />
            </div>

            <div className="settings-field-group">
              <label className="settings-label" htmlFor="price_prot">
                Price Protection %
              </label>
              <p className="settings-help">Maximum automatic price decrease.</p>
              <input
                id="price_prot"
                type="number"
                step="0.5"
                className="settings-input"
                value={aiForm.price_protection_pct}
                onChange={(e) => setAiForm({ ...aiForm, price_protection_pct: e.target.value })}
              />
            </div>
          </div>

          <div className="settings-subhead" style={{ marginTop: '24px' }}>
            <h3>Execution & Intelligence Models</h3>
          </div>

          <div className="settings-form-row">
            <div className="settings-field-group">
              <label className="settings-label">Groq LLM Model</label>
              <p className="settings-help">Used for Russian title & SEO attribute generation.</p>
              <div className="settings-type-select-wrap">
                <TypeSelect
                  label="Groq Model"
                  value={aiForm.groq_model}
                  options={[
                    { id: 'llama3-70b-8192', label: 'Llama 3 70B (High Precision)' },
                    { id: 'llama3-8b-8192', label: 'Llama 3 8B (High Speed)' },
                    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Large Context)' },
                    { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
                  ]}
                  onChange={(next) => setAiForm({ ...aiForm, groq_model: next })}
                />
              </div>
            </div>

            <div className="settings-field-group">
              <label className="settings-label" htmlFor="concurrency">
                Queue Concurrency
              </label>
              <p className="settings-help">Maximum simultaneous worker threads.</p>
              <input
                id="concurrency"
                type="number"
                className="settings-input"
                value={aiForm.queue_concurrency}
                onChange={(e) => setAiForm({ ...aiForm, queue_concurrency: e.target.value })}
              />
            </div>

            <div className="settings-field-group">
              <label className="settings-label" htmlFor="auto_retry">
                Failed Agent Retries
              </label>
              <p className="settings-help">Automatic re-attempts on timeout.</p>
              <input
                id="auto_retry"
                type="number"
                className="settings-input"
                value={aiForm.auto_retry_count}
                onChange={(e) => setAiForm({ ...aiForm, auto_retry_count: e.target.value })}
              />
            </div>
          </div>

          <div className="settings-subhead" style={{ marginTop: '24px' }}>
            <h3>Scan Frequencies</h3>
          </div>

          <div className="settings-form-row">
            <div className="settings-field-group">
              <label className="settings-label" htmlFor="amazon_scan">
                Amazon Rescan Frequency (Hours)
              </label>
              <p className="settings-help">Default: 168 (Weekly).</p>
              <input
                id="amazon_scan"
                type="number"
                className="settings-input"
                value={aiForm.amazon_scan_freq_hours}
                onChange={(e) => setAiForm({ ...aiForm, amazon_scan_freq_hours: e.target.value })}
              />
            </div>

            <div className="settings-field-group">
              <label className="settings-label" htmlFor="comp_scan">
                Competitor Scan Frequency (Hours)
              </label>
              <p className="settings-help">Default: 24 (Daily).</p>
              <input
                id="comp_scan"
                type="number"
                className="settings-input"
                value={aiForm.competitor_scan_freq_hours}
                onChange={(e) => setAiForm({ ...aiForm, competitor_scan_freq_hours: e.target.value })}
              />
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="dash-primary settings-submit-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save AI Parameters'}
            </button>
            {message && <span className="settings-notice is-ok">{message}</span>}
            {error && <span className="settings-notice is-bad">{error}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
