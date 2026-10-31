'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
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
      <button type="button" className="accounts-delete" onClick={() => { setError(''); setOpen(true); }}>
        <RemoveIcon />
        Delete
      </button>

      {open && (
        <div className="confirm-backdrop" onClick={() => { if (!pending) setOpen(false); }}>
          <div
            className="confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-${id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="confirm-icon" aria-hidden="true">
              <RemoveIcon />
            </span>
            <h2 id={`delete-${id}`}>Delete {name}?</h2>
            <p>This removes the seller account from the app. Saved orders stay. This cannot be undone.</p>
            {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
            <div className="confirm-actions">
              <button
                ref={cancelRef}
                type="button"
                className="dash-outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="confirm-danger" disabled={pending} onClick={confirmDelete}>
                {pending ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
