import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { DEFAULT_BANDS, bandsChosen, normalizeBands } from '../../../../lib/catalog/weightBands';
import { DEFAULT_RULES, normalizeRules } from '../../../../lib/catalog/scrapeRules';

export const dynamic = 'force-dynamic';

const SETTING_ID = 'default';

function bandsFromRow(row = {}) {
  if (row.weightBands) {
    try {
      const parsed = typeof row.weightBands === 'string' ? JSON.parse(row.weightBands) : row.weightBands;
      if (parsed && typeof parsed === 'object') return normalizeBands(parsed);
    } catch {
      /* fall through */
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

async function readSetting() {
  return prisma.catalogSetting.findUnique({ where: { id: SETTING_ID } });
}

async function ensureSetting() {
  const existing = await readSetting();
  if (existing) return existing;
  return prisma.catalogSetting.create({
    data: {
      id: SETTING_ID,
      startPage: 1,
      pages: 3,
      oldPriceMultiplier: 2,
      productLimit: 20,
      applyWeightGate: true,
      weightBands: JSON.stringify(DEFAULT_BANDS),
      scrapeRules: JSON.stringify(DEFAULT_RULES),
    },
  });
}

export async function GET() {
  const row = await ensureSetting();
  return NextResponse.json(clean(row));
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const saved = clean(body);
  const bands = saved.weightBands;
  await prisma.catalogSetting.upsert({
    where: { id: SETTING_ID },
    create: {
      id: SETTING_ID,
      startPage: saved.startPage,
      pages: saved.pages,
      oldPriceMultiplier: saved.oldPriceMultiplier,
      productLimit: saved.productLimit,
      applyWeightGate: saved.applyWeightGate,
      weightBands: JSON.stringify(bands),
      scrapeRules: JSON.stringify(saved.scrapeRules),
    },
    update: {
      startPage: saved.startPage,
      pages: saved.pages,
      oldPriceMultiplier: saved.oldPriceMultiplier,
      productLimit: saved.productLimit,
      applyWeightGate: saved.applyWeightGate,
      weightBands: JSON.stringify(bands),
      scrapeRules: JSON.stringify(saved.scrapeRules),
    },
  });
  return NextResponse.json(saved);
}
