'use client';

import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useState } from 'react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="dash-primary"
      type="submit"
      disabled={pending}
      style={{
        height: 38,
        padding: '0 18px',
        fontSize: 13,
        fontWeight: 700,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {pending ? 'Saving Account…' : 'Save & Connect Account'}
    </button>
  );
}

function SavedToast({ saved }) {
  const router = useRouter();
  const [visible, setVisible] = useState(saved);

  useEffect(() => {
    if (!saved) return;
    setVisible(true);
    router.replace('/accounts', { scroll: false });
  }, [saved, router]);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="app-toast"
      role="status"
      style={{
        background: '#ECFDF5',
        border: '1px solid #A7F3D0',
        color: '#065F46',
        borderRadius: 10,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
      }}
    >
      <span style={{ fontSize: 16 }}>✓</span>
      <span style={{ fontWeight: 600, fontSize: 13.5 }}>Account connected and saved successfully.</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        style={{ background: 'none', border: 'none', marginLeft: 'auto', cursor: 'pointer', color: '#065F46', fontSize: 16 }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default function AccountForm({ action, saved, onDone }) {
  const [state, formAction] = useFormState(action, null);
  const [showKey, setShowKey] = useState(false);

  return (
    <form action={formAction} style={{ margin: 0 }}>
      <SavedToast saved={saved} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 5 }}>
            Store / Account Name *
          </label>
          <input
            name="name"
            placeholder="e.g. Sunrise Luxury"
            required
            autoComplete="organization"
            style={{
              width: '100%',
              height: 38,
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 13,
              color: '#0F172A',
              outline: 'none',
              background: '#FFFFFF',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 5 }}>
            Ozon Client ID *
          </label>
          <input
            name="client_id"
            placeholder="e.g. 1948271"
            required
            inputMode="numeric"
            autoComplete="off"
            style={{
              width: '100%',
              height: 38,
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              color: '#0F172A',
              outline: 'none',
              background: '#FFFFFF',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 5 }}>
            Ozon API Key *
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              name="api_key"
              placeholder="e.g. 9b4d8a1c-..."
              type={showKey ? 'text' : 'password'}
              required
              autoComplete="new-password"
              style={{
                width: '100%',
                height: 38,
                border: '1px solid #CBD5E1',
                borderRadius: 8,
                padding: '0 54px 0 12px',
                fontSize: 13,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                color: '#0F172A',
                outline: 'none',
                background: '#FFFFFF',
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey((current) => !current)}
              style={{
                position: 'absolute',
                right: 8,
                background: '#F1F5F9',
                border: '1px solid #E2E8F0',
                borderRadius: 5,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 700,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        {onDone && (
          <button
            type="button"
            className="dash-outline"
            onClick={onDone}
            style={{ height: 38, padding: '0 16px', fontSize: 13, borderRadius: 8 }}
          >
            Cancel
          </button>
        )}
        <SubmitButton />
      </div>

      {state?.error && (
        <p className="notice notice-error" role="alert" style={{ marginTop: 12 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
