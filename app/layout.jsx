import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { Inter } from 'next/font/google';
import './globals.css';
import AppSidebar from './AppSidebar';
import TopProgressBar from './components/TopProgressBar';
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
        <Suspense fallback={null}>
          <TopProgressBar />
        </Suspense>
        {signedIn ? (
          <div className="layout">
            <AppSidebar />

            <main className="main-content">
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
