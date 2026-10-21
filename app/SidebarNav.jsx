'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function NavIcon({ children }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

const MAIN_LINKS = [
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
    href: '/orders',
    label: 'Orders',
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
];

const AI_LINKS = [
  {
    href: '/ai-settings',
    label: 'AI Settings',
    className: 'nav-link-ai-settings',
    icon: (
      <NavIcon>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </NavIcon>
    ),
  },
  {
    href: '/listing-optimization',
    label: 'AI Listing Auditor',
    className: 'nav-link-ai-listing',
    icon: (
      <NavIcon>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </NavIcon>
    ),
  },
];

function linkActive(pathname, href, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({ item, active }) {
  return (
    <Link
      href={item.href}
      className={item.className ? `nav-link nav-link-ai ${item.className}` : 'nav-link'}
      data-active={active ? 'true' : 'false'}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="side-nav" aria-label="Main">
      {MAIN_LINKS.map((item) => (
        <NavItem key={item.href} item={item} active={linkActive(pathname, item.href, item.exact)} />
      ))}

      <div className="sidebar-section-label">AI ENGINE</div>

      {AI_LINKS.map((item) => (
        <NavItem key={item.href} item={item} active={linkActive(pathname, item.href)} />
      ))}
    </nav>
  );
}
