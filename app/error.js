'use client';

import FriendlyError from './components/FriendlyError';

export default function AppError({ error, reset }) {
  return <FriendlyError error={error} reset={reset} />;
}
