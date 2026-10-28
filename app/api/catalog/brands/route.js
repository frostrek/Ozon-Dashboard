import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextResponse } from 'next/server';

const DASHBOARD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeRoot() {
  return process.env.CATALOG_SAFE_ROOT
    || path.resolve(DASHBOARD_ROOT, 'safe-pipeline');
}

function tokensFor(keyword) {
  return String(keyword || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.replace(/[%_]/g, ''))
    .filter((token) => token.length >= 2)
    .slice(0, 6);
}

export async function GET(request) {
  const keyword = new URL(request.url).searchParams.get('keyword')?.trim() || '';
  const tokens = tokensFor(keyword);
  if (!tokens.length) {
    return NextResponse.json({ error: 'Enter a keyword before looking up brands.', suggestions: [] }, { status: 400 });
  }

  const dbPath = path.join(safeRoot(), 'ozon-pipeline.db');
  if (!existsSync(dbPath)) {
    return NextResponse.json({
      keyword,
      suggestions: [],
      note: 'The local catalog database is not available. You can type a brand yourself.',
    });
  }

  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const where = tokens.map(() => 'lower(name) LIKE ?').join(' AND ');
    const params = tokens.map((token) => `%${token}%`);
    const rows = db.prepare(`
      SELECT brand, COUNT(*) AS products
      FROM products
      WHERE brand IS NOT NULL
        AND trim(brand) != ''
        AND ${where}
      GROUP BY brand
      ORDER BY products DESC, brand COLLATE NOCASE
      LIMIT 12
    `).all(...params);
    db.close();
    return NextResponse.json({
      keyword,
      suggestions: rows.map((row) => ({
        brand: String(row.brand),
        products: Number(row.products) || 0,
      })),
    });
  } catch {
    return NextResponse.json({
      keyword,
      suggestions: [],
      note: 'Brand suggestions could not be loaded. You can type a brand yourself.',
    });
  }
}
