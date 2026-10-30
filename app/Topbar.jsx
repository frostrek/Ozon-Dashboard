'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const PAGES = [
  { href: '/', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/labels', label: 'Labels' },
  { href: '/products', label: 'Products' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/orders', label: 'Orders' },
  { href: '/reports', label: 'Reports' },
  { href: '/logs', label: 'Logs' },
  { href: '/settings', label: 'Settings' },
  { href: '/ai-settings', label: 'AI Settings' },
  { href: '/listing-optimization', label: 'AI Listing Auditor' },
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'OZ';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function Topbar() {
  const router = useRouter();
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const [openSearch, setOpenSearch] = useState(false);
  const [runs, setRuns] = useState([]);
  const [status, setStatus] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [syncRes, runsRes] = await Promise.all([
          fetch('/api/sync/status', { cache: 'no-store' }),
          fetch('/api/catalog/runs', { cache: 'no-store' }),
        ]);
        const sync = await syncRes.json();
        const catalog = await runsRes.json();
        if (cancelled) return;
        setStatus(sync);
        setRuns(Array.isArray(catalog.runs) ? catalog.runs : []);
      } catch {
        if (!cancelled) setStatus((current) => current || { syncState: 'failed', supabase: { label: 'Sync failed' }, sqlite: { ok: false, label: 'MongoDB unavailable' }, notifications: [], user: { name: 'Signed in', role: 'Operator' } });
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        setOpenSearch(true);
      }
      if (event.key === 'Escape') {
        setOpenSearch(false);
        setNotesOpen(false);
        setAccountOpen(false);
        setNavOpen(false);
        document.body.classList.remove('nav-open');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen);
    return () => document.body.classList.remove('nav-open');
  }, [navOpen]);

  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    const pages = PAGES.filter((page) => page.label.toLowerCase().includes(text));
    const catalog = runs
      .filter((run) => `${run.keyword || ''} ${run.brand || ''} ${run.accountName || ''}`.toLowerCase().includes(text))
      .slice(0, 6)
      .map((run) => ({
        href: `/catalog/runs/${run.runId}`,
        label: run.keyword || run.brand || 'Catalog run',
        meta: run.accountName || run.status,
      }));
    return [
      ...pages.map((page) => ({ ...page, meta: 'Page' })),
      ...catalog,
    ].slice(0, 8);
  }, [query, runs]);

  const notes = status?.notifications || [];
  const user = status?.user || { name: 'Signed in', role: 'Operator' };
  const cloudLabel = status?.supabase?.label || 'Checking connection';
  const sqliteLabel = status?.sqlite?.label || 'Checking MongoDB';
  const syncState = status?.syncState || 'pending';

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
    {navOpen ? <button type="button" className="nav-backdrop" aria-label="Close menu" onClick={() => setNavOpen(false)} /> : null}
    <header className="topbar">
      <button
        type="button"
        className="nav-toggle"
        aria-label={navOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={navOpen}
        onClick={() => setNavOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      <div className="global-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={searchRef}
          value={query}
          placeholder="Search anything..."
          aria-label="Search pages and catalog runs"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpenSearch(true);
          }}
          onFocus={() => setOpenSearch(true)}
        />
        <kbd>Ctrl K</kbd>
        {openSearch && query.trim() ? (
          <div className="search-results" role="listbox">
            {results.length === 0 ? <p>No matching pages or catalog runs.</p> : results.map((item) => (
              <Link key={item.href + item.label} href={item.href} onClick={() => { setOpenSearch(false); setQuery(''); setNavOpen(false); }}>
                <strong>{item.label}</strong>
                <span>{item.meta}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="top-actions">
        <div className={`conn-pill conn-${syncState}`} title={status?.storageNote || ''}>
          <span className="sync-dot" />
          <span>
            <strong>{cloudLabel}</strong>
            <small>{sqliteLabel}</small>
          </span>
        </div>

        <div className="menu-anchor">
          <button type="button" className="icon-btn" aria-label="Notifications" onClick={() => { setNotesOpen((value) => !value); setAccountOpen(false); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
            {notes.length > 0 ? <span className="note-count">{notes.length}</span> : null}
          </button>
          {notesOpen ? (
            <div className="flyout">
              {notes.length === 0 ? <p>No open alerts.</p> : notes.map((note) => (
                <Link key={note.id} href={note.href || '/logs'} onClick={() => setNotesOpen(false)}>
                  <strong>{note.level || 'INFO'}</strong>
                  <span>{note.message}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <div className="menu-anchor">
          <button type="button" className="user-chip" onClick={() => { setAccountOpen((value) => !value); setNotesOpen(false); }}>
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </span>
          </button>
          {accountOpen ? (
            <div className="flyout">
              <button type="button" onClick={logout}>Sign out</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
    </>
  );
}
