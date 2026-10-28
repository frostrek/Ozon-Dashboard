import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextResponse } from 'next/server';

const DASHBOARD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const loaded = new Map();

function safeRoot() {
  return process.env.CATALOG_SAFE_ROOT
    || path.resolve(DASHBOARD_ROOT, 'safe-pipeline');
}

function brandsFor(catId) {
  if (loaded.has(catId)) return loaded.get(catId);
  const file = path.join(safeRoot(), `brand-cache-${catId}.json`);
  if (!existsSync(file)) {
    loaded.set(catId, null);
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const brands = (Array.isArray(parsed) ? parsed : [])
      .map((item) => String(item?.value || '').trim())
      .filter((value) => value && value.toLowerCase() !== 'нет бренда');
    loaded.set(catId, brands);
    return brands;
  } catch {
    loaded.set(catId, null);
    return null;
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const catId = Number(url.searchParams.get('catId'));
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
  if (!catId) {
    return NextResponse.json({
      suggestions: [],
      note: 'Choose an Ozon category first. Brand names come from that category’s Ozon list.',
    });
  }
  if (query.length < 2) {
    return NextResponse.json({
      suggestions: [],
      note: 'Type at least 2 letters. Matches come from the Ozon brand list for this category.',
    });
  }

  const brands = brandsFor(catId);
  if (!brands) {
    return NextResponse.json({
      suggestions: [],
      note: 'This category has no saved Ozon brand list. Type a brand, or skip this step.',
    });
  }

  const starts = [];
  const contains = [];
  for (const brand of brands) {
    const name = brand.toLowerCase();
    if (name.startsWith(query)) starts.push(brand);
    else if (name.includes(query)) contains.push(brand);
    if (starts.length >= 12 && contains.length >= 12) break;
  }
  const suggestions = [...starts, ...contains].slice(0, 12);
  return NextResponse.json({
    suggestions,
    note: suggestions.length ? '' : `No Ozon brand in this category starts with or contains “${query}”.`,
  });
}
