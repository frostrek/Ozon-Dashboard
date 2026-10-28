'use client';

import { useEffect, useRef, useState } from 'react';

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

export default function DeleteAccount({ action, id, name }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
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

  return (
    <>
      <button type="button" className="accounts-delete" onClick={() => setOpen(true)}>
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
            <form action={action} onSubmit={() => setPending(true)}>
              <input type="hidden" name="id" value={id} />
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
                <button type="submit" className="confirm-danger" disabled={pending}>
                  {pending ? 'Deleting...' : 'Delete account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
