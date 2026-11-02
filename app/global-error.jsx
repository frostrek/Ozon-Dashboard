'use client';

import FriendlyError from './components/FriendlyError';
import './globals.css';

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body>
        <div className="help-error-shell">
          <FriendlyError error={error} reset={reset} />
        </div>
      </body>
    </html>
  );
}
