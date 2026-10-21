export const COOKIE_NAME = 'ozon_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  return process.env.AUTH_SECRET || '';
}

function safeEqual(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function encode(bytes) {
  let text = '';
  bytes.forEach((value) => {
    text += String.fromCharCode(value);
  });
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encode(new Uint8Array(signature));
}

export function checkCredentials(username, password) {
  const expectedUser = process.env.DASHBOARD_USERNAME || '';
  const expectedPass = process.env.DASHBOARD_PASSWORD || '';
  if (!expectedUser || !expectedPass || !secret()) return false;
  return safeEqual(username, expectedUser) && safeEqual(password, expectedPass);
}

export async function createSessionToken() {
  const body = `v1.${Date.now() + SESSION_MAX_AGE * 1000}`;
  return `${body}.${await sign(body)}`;
}

export async function verifySessionToken(token) {
  if (!token || !secret()) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const body = `${parts[0]}.${parts[1]}`;
  return safeEqual(await sign(body), parts[2]);
}
