'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

function NavIcon({ children }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

const NAV_SECTIONS = [
  {
    title: 'OVERVIEW',
    items: [
      {
        href: '/',
        label: 'Dashboard',
        exact: true,
        icon: (
          <NavIcon>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </NavIcon>
        ),
      },
      {
        href: '/orders',
        label: 'Orders',
        hasBadge: true,
        icon: (
          <NavIcon>
            <path d="M6 6h15l-1.5 9h-12z" />
            <path d="M6 6L5 3H2" />
            <circle cx="9" cy="20" r="1" />
            <circle cx="18" cy="20" r="1" />
          </NavIcon>
        ),
      },
      {
        href: '/products',
        label: 'Products',
        icon: (
          <NavIcon>
            <path d="M21 8l-9-5-9 5 9 5 9-5z" />
            <path d="M3 8v8l9 5 9-5V8" />
            <path d="M12 13v8" />
          </NavIcon>
        ),
      },
      {
        href: '/accounts',
        label: 'Accounts',
        icon: (
          <NavIcon>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="3" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a3 3 0 0 1 0 5.75" />
          </NavIcon>
        ),
      },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      {
        href: '/pipeline',
        label: 'Pipeline',
        icon: (
          <NavIcon>
            <path d="M4 6h16M4 12h10M4 18h16" />
          </NavIcon>
        ),
      },
      {
        href: '/labels',
        label: 'Labels',
        icon: (
          <NavIcon>
            <path d="M20 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" />
            <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
          </NavIcon>
        ),
      },
      {
        href: '/catalog',
        label: 'Product Scraping',
        icon: (
          <NavIcon>
            <path d="M4 5h16v4H4z" />
            <path d="M4 10h16v4H4z" />
            <path d="M4 15h16v4H4z" />
          </NavIcon>
        ),
      },
      {
        href: '/charges',
        label: 'Order Charges',
        icon: (
          <NavIcon>
            <path d="M14 2H6a2 2 0 0 0-2 2v16l3-1.5 3 1.5 3-1.5 3 1.5 3-1.5 3 1.5V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h4" />
            <path d="M8 17h8" />
          </NavIcon>
        ),
      },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      {
        href: '/reports',
        label: 'Reports',
        icon: (
          <NavIcon>
            <path d="M4 19V5M4 19h16" />
            <path d="M8 16v-5M12 16V8M16 16v-3" />
          </NavIcon>
        ),
      },
      {
        href: '/logs',
        label: 'Logs',
        icon: (
          <NavIcon>
            <path d="M8 6h13M8 12h13M8 18h13" />
            <path d="M3 6h.01M3 12h.01M3 18h.01" />
          </NavIcon>
        ),
      },
      {
        href: '/settings',
        label: 'Settings',
        icon: (
          <NavIcon>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </NavIcon>
        ),
      },
    ],
  },
];

function linkActive(pathname, href, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// In-memory timestamp to prevent redundant API calls on fast navigation
let lastCountsFetchTime = 0;
let cachedPendingCount = null;

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(cachedPendingCount);
  const [loggingOut, setLoggingOut] = useState(false);
  const [navigatingHref, setNavigatingHref] = useState(null);

  // Restore collapsed state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ozon_sidebar_collapsed');
      if (saved === 'true') {
        setCollapsed(true);
      }
    } catch {}
  }, []);

  // Fetch pending orders count for dynamic badge (polled every 60s, decoupled from route changes)
  useEffect(() => {
    let unmounted = false;
    async function loadCounts() {
      const now = Date.now();
      // Skip if fetched less than 25 seconds ago
      if (cachedPendingCount !== null && now - lastCountsFetchTime < 25000) {
        if (!unmounted) setPendingOrdersCount(cachedPendingCount);
        return;
      }
      try {
        const res = await fetch('/api/orders/counts', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!unmounted && data?.pending !== undefined) {
          lastCountsFetchTime = Date.now();
          cachedPendingCount = data.pending;
          setPendingOrdersCount(data.pending);
        }
      } catch {}
    }
    loadCounts();
    // Refresh count every 60s without re-triggering on pathname changes
    const timer = setInterval(loadCounts, 60000);
    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, []);

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle collapse
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapsed]);

  // Reset navigation indicator and close mobile drawer on route change
  useEffect(() => {
    setNavigatingHref(null);
    setMobileOpen(false);
  }, [pathname]);

  // Safety fallback: if navigation takes too long or fails, clear spinner automatically
  useEffect(() => {
    if (!navigatingHref) return;
    const timer = setTimeout(() => {
      setNavigatingHref(null);
    }, 30000); // 30 seconds safety timeout so spinner does not vanish while page is compiling/loading
    return () => clearTimeout(timer);
  }, [navigatingHref]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    document.body.classList.toggle('sidebar-open', mobileOpen);
    return () => document.body.classList.remove('sidebar-open');
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ozon_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  const renderNavLinks = (isMobile = false) => (
    <div className="side-nav-sections">
      {NAV_SECTIONS.map((section, idx) => (
        <div key={section.title} className="sidebar-section">
          {!collapsed || isMobile ? (
            <div className="sidebar-section-title">{section.title}</div>
          ) : idx > 0 ? (
            <div className="sidebar-section-divider" />
          ) : null}

          <div className="sidebar-section-items">
            {section.items.map((item) => {
              const active = linkActive(pathname, item.href, item.exact);
              const isNavigating = navigatingHref === item.href && !active;
              const showBadge = item.hasBadge && pendingOrdersCount > 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className="nav-link"
                  data-active={active ? 'true' : 'false'}
                  data-navigating={isNavigating ? 'true' : undefined}
                  title={collapsed && !isMobile ? `${item.label}${showBadge ? ` (${pendingOrdersCount})` : ''}` : undefined}
                  onClick={() => {
                    setMobileOpen(false);
                    if (pathname !== item.href) {
                      setNavigatingHref(item.href);
                    } else {
                      setNavigatingHref(null);
                    }
                  }}
                >
                  <span className="nav-icon-wrap">
                    {item.icon}
                    {collapsed && !isMobile && showBadge && (
                      <span className="nav-badge-dot" title={`${pendingOrdersCount} pending orders`} />
                    )}
                  </span>

                  {(!collapsed || isMobile) && (
                    <>
                      <span className="nav-link-label">{item.label}</span>
                      {isNavigating ? (
                        <span
                          className="nav-spinner"
                          title="Opening..."
                          aria-label="Opening..."
                        />
                      ) : showBadge ? (
                        <span className="nav-badge" title={`${pendingOrdersCount} orders ready for packaging/delivery`}>
                          {pendingOrdersCount}
                        </span>
                      ) : null}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop & Collapsible Sidebar */}
      <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="Main sidebar">
        {/* Brand Header */}
        <div className="brand">
          <div className="brand-left">
            <span className="brand-mark" aria-hidden="true">Oz</span>
            {!collapsed && (
              <div className="brand-text">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <h2>Ozon</h2>
                  <span className="sidebar-live-chip">● Live</span>
                </div>
                <p>Fulfillment</p>
              </div>
            )}
          </div>

          {/* Collapse Toggle Button */}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
        </div>

        {/* Scrollable Navigation */}
        <nav className="side-nav side-nav-desktop" aria-label="Main">
          {renderNavLinks(false)}
        </nav>

        {/* User Profile Card & Sign Out Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-profile-card" style={{ marginBottom: 6 }}>
            <div className="sidebar-avatar" title="Signed in as Admin">
              AD
            </div>

            {!collapsed && (
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">Admin</div>
                <div className="sidebar-user-role">Fulfillment Ops</div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="nav-link logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out of Ozon Dashboard"
            style={{
              width: '100%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '8px 0' : '8px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="#F87171"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!collapsed && (
              <span style={{ color: '#F87171', fontWeight: 650, fontSize: 13.5 }}>
                {loggingOut ? 'Signing out…' : 'Sign out'}
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Topbar Toggle (shown on small screens) */}
      <button
        type="button"
        className="sidebar-mobile-toggle"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer (always full width) */}
      <nav
        className={`side-nav side-nav-mobile${mobileOpen ? ' is-open' : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
      >
        <div className="brand" style={{ marginBottom: 12 }}>
          <span className="brand-mark" aria-hidden="true">Oz</span>
          <div className="brand-text">
            <h2>Ozon</h2>
            <p>Fulfillment</p>
          </div>
        </div>
        {renderNavLinks(true)}
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button
            type="button"
            className="nav-link logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
              <path d="M15 16l4-4-4-4" />
              <path d="M19 12H9" />
            </svg>
            <span>{loggingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

