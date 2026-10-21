import { cookies } from 'next/headers';
import { Inter } from 'next/font/google';
import './globals.css';
import SyncStatusTracker from './SyncStatusTracker';
import SidebarNav from './SidebarNav';
import LogoutButton from './LogoutButton';
import { COOKIE_NAME, verifySessionToken } from '../lib/auth';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'Ozon Fulfillment Dashboard',
  description: 'Manage Multiple Ozon Accounts',
};

export default async function RootLayout({ children }) {
  const signedIn = await verifySessionToken(cookies().get(COOKIE_NAME)?.value);

  return (
    <html lang="en">
      <body className={inter.className}>
        {signedIn ? (
          <div className="layout">
            <aside className="sidebar">
              <div className="brand">
                <span className="brand-mark" aria-hidden="true">Oz</span>
                <div>
                  <h2>Ozon</h2>
                  <p>Fulfillment</p>
                </div>
              </div>
              <SidebarNav />
              <LogoutButton />
            </aside>

            <main className="main-content">
              <header className="topbar">
                <div className="title">Workspace</div>
                <SyncStatusTracker />
              </header>

              <div className="content-area">
                {children}
              </div>
            </main>
          </div>
        ) : children}
      </body>
    </html>
  );
}
