'use client';

import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useState } from 'react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="dash-primary accounts-submit" type="submit" disabled={pending}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      {pending ? 'Saving...' : 'Add Account'}
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
    <div className="app-toast" role="status">
      <span className="app-toast-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7" /></svg>
      </span>
      <span>Account saved.</span>
      <button type="button" className="app-toast-close" onClick={() => setVisible(false)} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}

export default function AccountForm({ action, saved }) {
  const [state, formAction] = useFormState(action, null);
  const [showKey, setShowKey] = useState(false);

  return (
    <form action={formAction} className="accounts-add">
      <SavedToast saved={saved} />
      <div className="accounts-add-top">
        <SubmitButton />
      </div>
      <div className="accounts-fields">
        <label className="field">
          <span className="field-label">Account name</span>
          <input name="name" placeholder="Account name" required autoComplete="organization" />
        </label>
        <label className="field">
          <span className="field-label">Ozon client ID</span>
          <input name="client_id" placeholder="Client ID" required inputMode="numeric" autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">Ozon API key</span>
          <span className="accounts-key">
            <input
              name="api_key"
              placeholder="API key"
              type={showKey ? 'text' : 'password'}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="accounts-eye"
              aria-pressed={showKey}
              onClick={() => setShowKey((current) => !current)}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
      </div>
      {state?.error && <p className="notice notice-error accounts-form-error" role="alert">{state.error}</p>}
    </form>
  );
}
