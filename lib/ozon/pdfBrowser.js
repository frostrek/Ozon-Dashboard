import { existsSync } from 'node:fs';
import path from 'node:path';

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
  if (localChrome) {
    const puppeteer = await import('puppeteer');
    return puppeteer.launch({
      headless: true,
      executablePath: localChrome,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const chromium = await import('@sparticuz/chromium');
  const puppeteerCore = await import('puppeteer-core');
  const executablePath = await chromium.default.executablePath();
  return puppeteerCore.launch({
    args: chromium.default.args,
    defaultViewport: chromium.default.defaultViewport,
    executablePath,
    headless: chromium.default.headless,
  });
}
