'use client';

import { useCallback, useState } from 'react';

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((message, tone = 'ok') => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current.slice(-4), { id, message: text, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  return { toasts, push, dismiss };
}

export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts?.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`app-toast${toast.tone === 'error' ? ' app-toast-error' : ''}`} role="status">
          <span className="app-toast-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d={toast.tone === 'error' ? 'M6 6l12 12M18 6 6 18' : 'M5 12.5 9.5 17 19 7'} /></svg>
          </span>
          <span className="app-toast-text">{toast.message}</span>
          <button type="button" className="app-toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
