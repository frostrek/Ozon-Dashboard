'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export default function DeleteAccount({ id, name }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    function onKey(event) {
      if (event.key === 'Escape' && !pending) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pending]);

  async function confirmDelete() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The account could not be deleted.');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="accounts-delete"
        onClick={() => { setError(''); setOpen(true); }}
        title={`Disconnect and delete ${name}`}
        style={{
          height: 32,
          padding: '0 10px',
          fontSize: 12.5,
          fontWeight: 650,
          borderRadius: 7,
          background: '#FFF1F2',
          border: '1px solid #FECDD3',
          color: '#E11D48',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          transition: 'all 0.15s ease',
        }}
      >
        <RemoveIcon />
        <span>Delete</span>
      </button>

      {open && (
        <div
          className="confirm-backdrop"
          onClick={() => { if (!pending) setOpen(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            className="confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-${id}`}
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.16)',
              maxWidth: 420,
              width: '100%',
              padding: 24,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'grid',
                placeItems: 'center',
                fontSize: 20,
                marginBottom: 14,
              }}
            >
              ⚠️
            </div>

            <h2 id={`delete-${id}`} style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
              Delete “{name}”?
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#64748B', lineHeight: 1.5 }}>
              This will disconnect the store credentials from the dashboard. Historical pipeline logs and completed reports will remain preserved. This action cannot be undone.
            </p>

            {error ? (
              <p className="notice notice-error" role="alert" style={{ marginBottom: 14 }}>
                {error}
              </p>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <button
                ref={cancelRef}
                type="button"
                className="dash-outline"
                disabled={pending}
                onClick={() => setOpen(false)}
                style={{ height: 38, padding: '0 16px', fontSize: 13, borderRadius: 8 }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmDelete}
                style={{
                  height: 38,
                  padding: '0 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 8,
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {pending ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
