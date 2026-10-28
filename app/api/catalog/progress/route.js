import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NextResponse } from 'next/server';

const DASHBOARD_ROOT = process.cwd();

export const dynamic = 'force-dynamic';

function safeRoot() {
  return process.env.CATALOG_SAFE_ROOT
    || path.resolve(DASHBOARD_ROOT, 'safe-pipeline');
}

function progressKey(keyword, brand, catId, typeId) {
  return `${(brand ? `${brand} ${keyword}` : keyword).toLowerCase().trim()}|${catId}|${typeId}`;
}

function readJsonRows() {
  const file = path.join(safeRoot(), 'scrape-progress.json');
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Object.entries(data || {}).map(([key, row]) => {
      const [label, catId, typeId] = String(key).split('|');
      return {
        key,
        keyword: String(label || ''),
        categoryId: Number(catId),
        typeId: Number(typeId),
        lastPage: Number(row?.last_page),
        updatedAt: row?.updated_at || '',
        source: 'saved file',
      };
    }).filter((row) => row.lastPage >= 1);
  } catch {
    return [];
  }
}

function readDbRows() {
  const file = path.join(safeRoot(), 'ozon-pipeline.db');
  if (!existsSync(file)) return readJsonRows();
  const db = new DatabaseSync(file);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scrape_progress (
        progress_key TEXT PRIMARY KEY,
        keyword      TEXT NOT NULL,
        brand        TEXT,
        category_id  INTEGER NOT NULL,
        type_id      INTEGER NOT NULL,
        last_page    INTEGER NOT NULL,
        updated_at   TEXT
      )
    `);
    const insert = db.prepare(`
      INSERT INTO scrape_progress (progress_key, keyword, brand, category_id, type_id, last_page, updated_at)
      VALUES (?, ?, '', ?, ?, ?, ?)
      ON CONFLICT(progress_key) DO NOTHING
    `);
    for (const row of readJsonRows()) {
      const [label, catId, typeId] = String(row.key).split('|');
      insert.run(row.key, label || row.keyword, Number(catId), Number(typeId), row.lastPage, row.updatedAt || null);
    }
    return db.prepare(`
      SELECT progress_key, keyword, brand, category_id, type_id, last_page, updated_at
      FROM scrape_progress
      WHERE last_page >= 1
    `).all().map((row) => ({
      key: row.progress_key,
      keyword: `${row.brand ? `${row.brand} ` : ''}${row.keyword}`.trim().toLowerCase(),
      categoryId: Number(row.category_id),
      typeId: Number(row.type_id),
      lastPage: Number(row.last_page),
      updatedAt: row.updated_at || '',
      source: 'catalog database',
    }));
  } catch {
    return readJsonRows();
  } finally {
    db.close();
  }
}

function chooseRow(rows, keyword, brand, catId, typeId) {
  const exact = rows.find((row) => row.key === progressKey(keyword, brand, catId, typeId));
  if (exact) return { ...exact, match: 'exact' };
  const needle = keyword.toLowerCase();
  const inCategory = rows.filter((row) => row.categoryId === catId && row.typeId === typeId);
  const keywordHit = inCategory.filter((row) => row.keyword.includes(needle));
  const pool = (keywordHit.length ? keywordHit : inCategory).slice().sort((a, b) => b.lastPage - a.lastPage || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (!pool[0]) return null;
  return { ...pool[0], match: keywordHit.length ? 'keyword' : 'category' };
}

function messageFor(row, keyword) {
  const when = row.updatedAt ? ` Saved ${String(row.updatedAt).slice(0, 10)}.` : '';
  if (row.match === 'exact') {
    return `The catalog database last scraped this keyword through page ${row.lastPage}.${when}`;
  }
  return `No exact save for "${keyword}". The catalog database last reached page ${row.lastPage} for "${row.keyword}" in this category.${when}`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const keyword = String(url.searchParams.get('keyword') || '').trim();
  const brand = String(url.searchParams.get('brand') || '').trim();
  const catId = Number(url.searchParams.get('catId'));
  const typeId = Number(url.searchParams.get('typeId'));
  if (!keyword || !catId || !typeId) {
    return NextResponse.json({
      found: false,
      lastPage: 0,
      suggestedPage: 1,
      message: 'Enter the page to start from. Type 0 to skip scraping.',
    });
  }
  const rows = readDbRows();
  const row = chooseRow(rows, keyword, brand, catId, typeId);
  if (!row) {
    return NextResponse.json({
      found: false,
      lastPage: 0,
      suggestedPage: 1,
      message: `No saved page for "${keyword}" is in the catalog database. Enter the page to start from. Type 0 to skip scraping.`,
    });
  }
  return NextResponse.json({
    found: true,
    lastPage: row.lastPage,
    suggestedPage: row.lastPage + 1,
    keyword: row.keyword,
    updatedAt: row.updatedAt,
    source: row.source,
    message: messageFor(row, keyword),
  });
}
