import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from './lib/auth';

const OPEN_PATHS = new Set(['/login', '/api/auth/login']);

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const signedIn = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);

  if (pathname === '/login' && signedIn) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (OPEN_PATHS.has(pathname)) return NextResponse.next();
  if (signedIn) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
