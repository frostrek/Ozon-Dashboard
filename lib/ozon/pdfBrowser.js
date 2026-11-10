import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Fix for Windows / Bun when running in sandbox: use workspace temp directory
const projectTemp = path.join(process.cwd(), '.temp');
if (!existsSync(projectTemp)) {
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(projectTemp, { recursive: true });
  } catch {}
}
process.env.TEMP = projectTemp;
process.env.TMP = projectTemp;

function systemChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  return candidates.find((file) => existsSync(file)) || '';
}

export async function launchPdfBrowser() {
  if (String(process.env.PUPPETEER_CACHE_DIR || '').includes('cursor-sandbox-cache')) {
    delete process.env.PUPPETEER_CACHE_DIR;
  }

  const localChrome = systemChromePath();
  const uniqueProfileDir = path.join(projectTemp, `chrome-profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  if (localChrome) {
    const puppeteer = await import('puppeteer');
    return puppeteer.launch({
      headless: true,
      executablePath: localChrome,
      userDataDir: uniqueProfileDir,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }

  const chromium = await import('@sparticuz/chromium');
  const puppeteerCore = await import('puppeteer-core');
  const chrome = chromium.default || chromium;
  if (chrome.setGraphicsMode !== undefined) chrome.setGraphicsMode = false;
  const executablePath = await chrome.executablePath();
  return puppeteerCore.launch({
    args: chrome.args,
    defaultViewport: chrome.defaultViewport,
    executablePath,
    headless: chrome.headless,
  });
}
