import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { DEFAULT_BANDS, bandsChosen, normalizeBands } from '../../../../lib/catalog/weightBands';
import { DEFAULT_RULES, normalizeRules } from '../../../../lib/catalog/scrapeRules';

export const dynamic = 'force-dynamic';

function bandsFromRow(row = {}) {
  if (row.weightBands) {
    try {
      const parsed = typeof row.weightBands === 'string' ? JSON.parse(row.weightBands) : row.weightBands;
      if (parsed && typeof parsed === 'object') return normalizeBands(parsed);
    } catch {
      /* fall through to an empty selection */
    }
  }
  return { ...DEFAULT_BANDS };
}

function rulesFromRow(row = {}) {
  if (!row.scrapeRules) return { ...DEFAULT_RULES };
  try {
    const parsed = typeof row.scrapeRules === 'string' ? JSON.parse(row.scrapeRules) : row.scrapeRules;
    return normalizeRules(parsed);
  } catch {
    return { ...DEFAULT_RULES };
  }
}

function clean(row = {}) {
  const limit = Number(row.productLimit);
  const bands = bandsFromRow(row);
  return {
    startPage: Math.max(0, Number(row.startPage) || 0),
    pages: Math.max(0, Math.min(10, Number(row.pages) || 0)),
    oldPriceMultiplier: Number(row.oldPriceMultiplier) >= 1 ? Number(row.oldPriceMultiplier) : 2,
    productLimit: limit === 0 ? 0 : Math.max(1, limit || 20),
    applyWeightGate: bandsChosen(bands) && !bands.over500 && !bands.unknown,
    weightBands: bands,
    scrapeRules: rulesFromRow(row),
  };
}

async function ensureBandsColumn() {
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info(CatalogSetting)');
  if (!columns.some((column) => column.name === 'weightBands')) {
    await prisma.$executeRawUnsafe('ALTER TABLE CatalogSetting ADD COLUMN weightBands TEXT');
  }
  if (!columns.some((column) => column.name === 'scrapeRules')) {
    await prisma.$executeRawUnsafe('ALTER TABLE CatalogSetting ADD COLUMN scrapeRules TEXT');
  }
}

async function readSetting() {
  await ensureBandsColumn();
  const rows = await prisma.$queryRawUnsafe(
    'SELECT startPage, pages, oldPriceMultiplier, productLimit, applyWeightGate, weightBands, scrapeRules FROM CatalogSetting WHERE id = ?',
    'default',
  );
  return rows[0] || null;
}

export async function GET() {
  const existing = await readSetting();
  if (!existing) {
    await prisma.$executeRawUnsafe(
      'INSERT INTO CatalogSetting (id, startPage, pages, oldPriceMultiplier, productLimit, applyWeightGate, weightBands, scrapeRules, updatedAt) VALUES (?, 1, 3, 2, 20, 1, ?, ?, CURRENT_TIMESTAMP)',
      'default',
      JSON.stringify(DEFAULT_BANDS),
      JSON.stringify(DEFAULT_RULES),
    );
  }
  return NextResponse.json(clean(existing || { startPage: 1, pages: 3, oldPriceMultiplier: 2, productLimit: 20, applyWeightGate: 1 }));
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const saved = clean(body);
  await ensureBandsColumn();
  await prisma.$executeRawUnsafe(
    `INSERT INTO CatalogSetting (id, startPage, pages, oldPriceMultiplier, productLimit, applyWeightGate, weightBands, scrapeRules, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       startPage = excluded.startPage,
       pages = excluded.pages,
       oldPriceMultiplier = excluded.oldPriceMultiplier,
       productLimit = excluded.productLimit,
       applyWeightGate = excluded.applyWeightGate,
       weightBands = excluded.weightBands,
       scrapeRules = excluded.scrapeRules,
       updatedAt = CURRENT_TIMESTAMP`,
    'default',
    saved.startPage,
    saved.pages,
    saved.oldPriceMultiplier,
    saved.productLimit,
    saved.applyWeightGate ? 1 : 0,
    JSON.stringify(saved.weightBands),
    JSON.stringify(saved.scrapeRules),
  );
  return NextResponse.json(saved);
}
