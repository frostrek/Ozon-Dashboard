import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';

const HOST = 'api-seller.ozon.ru';
const GAP_MS = 2000;
const BLOCK_MS = 6 * 60 * 60 * 1000;
const STAMP = path.join(process.cwd(), 'runs', '.ozon-rate');
const BLOCKS = path.join(process.cwd(), 'runs', '.ozon-blocks.json');
const LOCK = `${STAMP}.lock`;
const ALREADY_PAUSED = {
  '3200337': 24 * 60 * 60 * 1000,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function announce(message) {
  console.log(`[ozon] ${message}`);
  if (typeof globalThis.ozonNote === 'function') {
    Promise.resolve(globalThis.ozonNote(message)).catch(() => {});
  }
}

function clientIdOf(headers) {
  return String(headers['Client-Id'] || headers['client-id'] || '').trim();
}

function readJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function blocks() {
  const saved = readJson(BLOCKS);
  let changed = false;
  for (const [clientId, windowMs] of Object.entries(ALREADY_PAUSED)) {
    if (!saved[clientId]) {
      saved[clientId] = Date.now() + windowMs;
      changed = true;
    }
  }
  if (changed) writeJson(BLOCKS, saved);
  return saved;
}

function pauseMessage(until) {
  const hours = Math.max(1, Math.ceil((until - Date.now()) / (60 * 60 * 1000)));
  return `Ozon is pausing this seller account after too many requests. No further request will be sent for about ${hours} hours, so the pause is not refreshed.`;
}

export function ozonPauseReason(clientId) {
  const id = String(clientId || '').trim();
  if (!id) return '';
  const until = Number(blocks()[id]) || 0;
  return until > Date.now() ? pauseMessage(until) : '';
}

function rememberBlock(clientId) {
  if (!clientId) return;
  const saved = blocks();
  saved[clientId] = Date.now() + BLOCK_MS;
  writeJson(BLOCKS, saved);
}

async function pace(clientId) {
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });

  for (let turn = 0; turn < 400; turn++) {
    let handle;
    try {
      handle = fs.openSync(LOCK, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > 20_000) fs.unlinkSync(LOCK);
      } catch {
        // Another run is between the check and the delete.
      }
      await sleep(50);
      continue;
    }

    try {
      const stamps = readJson(STAMP);
      const last = Number(stamps[clientId || '*']) || 0;
      const wait = last + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      stamps[clientId || '*'] = Date.now();
      writeJson(STAMP, stamps);
      return;
    } finally {
      fs.closeSync(handle);
      try { fs.unlinkSync(LOCK); } catch { /* already released */ }
    }
  }

  throw new Error('Timed out waiting for a free Ozon request slot');
}

function decodeChunked(buffer) {
  const parts = [];
  let index = 0;

  while (index < buffer.length) {
    const lineEnd = buffer.indexOf('\r\n', index);
    if (lineEnd === -1) break;
    const size = Number.parseInt(buffer.slice(index, lineEnd).toString('utf8').split(';')[0], 16);
    if (!Number.isFinite(size) || size === 0) break;
    const start = lineEnd + 2;
    parts.push(buffer.slice(start, start + size));
    index = start + size + 2;
  }

  return Buffer.concat(parts);
}

function parseResponse(raw) {
  const splitAt = raw.indexOf('\r\n\r\n');
  if (splitAt === -1) {
    throw new Error('Incomplete response from Ozon');
  }

  const head = raw.slice(0, splitAt).toString('utf8');
  let body = raw.slice(splitAt + 4);
  const statusLine = head.split('\r\n')[0] || '';
  const status = Number(statusLine.split(' ')[1]);
  const headers = {};

  for (const line of head.split('\r\n').slice(1)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }

  if ((headers['transfer-encoding'] || '').includes('chunked')) {
    body = decodeChunked(body);
  }

  const text = body.toString('utf8');
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

function sendOnce(url, body, headers, timeoutMs) {
  const target = new URL(url);
  const payload = JSON.stringify(body ?? {});
  const lines = [
    `POST ${target.pathname} HTTP/1.1`,
    `Host: ${HOST}`,
    'Accept: application/json',
    'Content-Type: application/json',
    `Content-Length: ${Buffer.byteLength(payload)}`,
    'Connection: close',
  ];

  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (name === 'host' || name === 'content-type' || name === 'content-length' || name === 'connection') continue;
    lines.push(`${key}: ${value}`);
  }

  const request = `${lines.join('\r\n')}\r\n\r\n${payload}`;

  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: HOST,
      port: 443,
      servername: HOST,
    });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Ozon request timed out'));
    }, timeoutMs);

    let raw = Buffer.alloc(0);
    socket.on('secureConnect', () => socket.write(request));
    socket.on('data', (chunk) => {
      raw = Buffer.concat([raw, chunk]);
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(parseResponse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function rateLimitError(clientId) {
  rememberBlock(clientId);
  const error = new Error(pauseMessage(Date.now() + BLOCK_MS));
  error.ozonExhausted = true;
  error.status = 429;
  return error;
}

export async function ozonPost(url, body, headers = {}, timeoutMs = 30_000) {
  const clientId = clientIdOf(headers);
  const paused = ozonPauseReason(clientId);
  if (paused) {
    const error = new Error(paused);
    error.ozonExhausted = true;
    error.status = 429;
    throw error;
  }

  await pace(clientId);
  try {
    const response = await sendOnce(url, body, headers, timeoutMs);
    if (response.status === 429) throw rateLimitError(clientId);
    return response;
  } catch (error) {
    if (error.ozonExhausted) throw error;
    const retryable = /ECONNRESET|timed out|Incomplete response|EPIPE|socket/i.test(error.message || '');
    if (!retryable) throw error;

    announce('Connection to Ozon dropped. Waiting 8 seconds, then trying once more.');
    await sleep(8_000);
    const stillPaused = ozonPauseReason(clientId);
    if (stillPaused) {
      const blocked = new Error(stillPaused);
      blocked.ozonExhausted = true;
      blocked.status = 429;
      throw blocked;
    }
    await pace(clientId);
    const response = await sendOnce(url, body, headers, timeoutMs);
    if (response.status === 429) throw rateLimitError(clientId);
    return response;
  }
}
