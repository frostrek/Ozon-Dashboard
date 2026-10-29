"use client";
import { useState, useEffect } from 'react';
import TypeSelect from '../components/TypeSelect';

const FIELDS = [
    { key: 'min_margin_pct',             label: 'Minimum Margin %',               type: 'float',  desc: 'Products below this margin will be flagged as CRITICAL' },
    { key: 'min_match_confidence',        label: 'Min Amazon Match Confidence %',  type: 'int',    desc: 'Level 2+ matches below this are flagged for manual review' },
    { key: 'min_seo_score',              label: 'Minimum SEO Score',               type: 'int',    desc: 'Products below this score are prioritised as HIGH' },
    { key: 'min_content_rating',         label: 'Minimum Content Rating',          type: 'int',    desc: 'Content rating below this triggers listing audit' },
    { key: 'price_protection_pct',       label: 'Price Protection %',             type: 'float',  desc: 'Max allowed price reduction before human approval required' },
    { key: 'auto_retry_count',           label: 'Failed Agent Retry Count',        type: 'int',    desc: 'How many times a failed agent retries before giving up' },
    { key: 'queue_concurrency',          label: 'Queue Concurrency',               type: 'int',    desc: 'Max parallel agent executions (increase for larger servers)' },
    { key: 'groq_model',                 label: 'Groq LLM Model',                 type: 'select', options: ['llama3-70b-8192','llama3-8b-8192','mixtral-8x7b-32768','gemma2-9b-it'], desc: 'Model used for SEO title generation' },
    { key: 'google_vision_model',        label: 'Google Vision Model',            type: 'text',   desc: 'Used for future image-based product matching' },
    { key: 'amazon_scan_freq_hours',     label: 'Amazon Rescan Frequency (hours)', type: 'int',   desc: 'How often to re-check Amazon product data. Default: 168 (weekly)' },
    { key: 'competitor_scan_freq_hours', label: 'Competitor Scan Frequency (hrs)', type: 'int',   desc: 'How often to refresh competitor pricing. Default: 24 (daily)' },
];

export default function AISettingsPage() {
    const [settings, setSettings] = useState(null);
    const [saving, setSaving]     = useState(false);
    const [saved, setSaved]       = useState(false);
    const [loading, setLoading]   = useState(true);

    useEffect(() => {
        fetch('/api/settings').then(r => r.json()).then(s => { setSettings(s); setLoading(false); });
    }, []);

    const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

    const save = async () => {
        setSaving(true);
        const body = {};
        FIELDS.forEach(f => {
            const v = settings[f.key];
            body[f.key] = f.type === 'int' ? parseInt(v) : f.type === 'float' ? parseFloat(v) : v;
        });
        await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    if (loading) return <p className="page-lead">Loading AI settings...</p>;

    const sections = [
        { title: 'Quality thresholds', keys: ['min_margin_pct','min_match_confidence','min_seo_score','min_content_rating','price_protection_pct'] },
        { title: 'Execution', keys: ['auto_retry_count','queue_concurrency'] },
        { title: 'Models', keys: ['groq_model','google_vision_model'] },
        { title: 'Scan frequency', keys: ['amazon_scan_freq_hours','competitor_scan_freq_hours'] },
    ];

    return (
        <div>
            <header className="page-head">
                <h1>AI Settings</h1>
                <p className="page-lead">Thresholds and models for the listing agents. Changes apply on the next workflow run. This is separate from Telegram and translation on the Settings page.</p>
            </header>

            {sections.map(section => (
                <div key={section.title} className="stat-card" style={{ marginBottom: 16, maxWidth: 860 }}>
                    <p className="section-label">{section.title}</p>
                    {section.keys.map(key => {
                        const field = FIELDS.find(f => f.key === key);
                        if (!field) return null;
                        return (
                            <div key={key} className="ai-grid">
                                <div>
                                    <div className="field-label">{field.label}</div>
                                    <div className="field-help">{field.desc}</div>
                                </div>
                                <div>
                                    {field.type === 'select' ? (
                                        <TypeSelect
                                            label={field.label}
                                            value={settings[key] || field.options[0]}
                                            options={field.options.map((option) => ({ id: option, label: option }))}
                                            onChange={(next) => update(key, next)}
                                        />
                                    ) : (
                                        <input
                                            type={field.type === 'text' ? 'text' : 'number'}
                                            value={settings[key] ?? ''}
                                            onChange={e => update(key, e.target.value)}
                                            step={field.type === 'float' ? '0.1' : '1'}
                                            style={{ width: '100%' }}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}

            <div className="toolbar" style={{ marginTop: 8 }}>
                <button type="button" onClick={save} disabled={saving}>
                    {saved ? 'Saved' : saving ? 'Saving...' : 'Save'}
                </button>
                {saved && <p className="notice notice-ok" style={{ marginTop: 0 }}>Settings saved.</p>}
            </div>
            {settings?.updated_at && (
                <p className="field-help" style={{ marginTop: 12 }}>Last saved: {new Date(settings.updated_at).toLocaleString('en-IN')}</p>
            )}
        </div>
    );
}
