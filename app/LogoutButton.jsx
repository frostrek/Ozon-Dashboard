'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <button type="button" className="nav-link logout-btn" onClick={logout} disabled={pending}>
      <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
        <path d="M15 16l4-4-4-4" />
        <path d="M19 12H9" />
      </svg>
      <span>{pending ? 'Signing out...' : 'Sign out'}</span>
    </button>
  );
}
