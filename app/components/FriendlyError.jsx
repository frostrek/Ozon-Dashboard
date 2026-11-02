'use client';

import { explainError } from '../../lib/friendlyError';

export default function FriendlyError({ error, reset, kind = 'page', message = '', digest = '' }) {
  const packed = {
    message: message || (typeof error === 'string' ? error : error?.message) || '',
    digest: digest || (error?.digest ? String(error.digest) : ''),
  };
  const help = explainError(packed, kind);

  return (
    <section className="help-error" role="alert">
      <div className="help-error-icon" aria-hidden="true">!</div>
      <h1 className="help-error-title">{help.title}</h1>
      <p className="help-error-lead">{help.what}</p>

      <div className="help-error-block">
        <h2>Why this happened</h2>
        <p>{help.cause}</p>
      </div>

      <div className="help-error-block">
        <h2>What you can do</h2>
        <ol>
          {help.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      {help.code ? (
        <p className="help-error-code">
          Support code: <code>{help.code}</code>
        </p>
      ) : null}

      <div className="help-error-actions">
        {typeof reset === 'function' ? (
          <button type="button" className="dash-primary" onClick={reset}>Try again</button>
        ) : null}
        {help.actionHref ? (
          <a className="dash-primary" href={help.actionHref}>{help.actionLabel || 'Continue'}</a>
        ) : null}
        <a className="dash-outline" href="/">Go to Dashboard</a>
      </div>
    </section>
  );
}
