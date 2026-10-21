import { NextResponse } from 'next/server';
import { COOKIE_NAME, SESSION_MAX_AGE, checkCredentials, createSessionToken } from '../../../../lib/auth';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!checkCredentials(body.username, body.password)) {
    return NextResponse.json({ error: 'Wrong username or password.' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
