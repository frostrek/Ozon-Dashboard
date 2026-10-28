import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextResponse } from 'next/server';

const DASHBOARD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export const dynamic = 'force-dynamic';

let cachedTree = null;

function safeRoot() {
  return process.env.CATALOG_SAFE_ROOT
    || path.resolve(DASHBOARD_ROOT, 'safe-pipeline');
}

function readTree(file) {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const label = String(item.label || '').trim();
        const leaf = label.split('>').pop().trim().toLowerCase();
        return {
          catId: Number(item.catId),
          typeId: Number(item.typeId),
          label,
          leaf,
          hay: `${label} ${item.catId || ''} ${item.typeId || ''}`.toLowerCase(),
        };
      })
      .filter((item) => item.catId && item.typeId && item.label);
  } catch {
    return [];
  }
}

function categoryTree() {
  if (cachedTree) return cachedTree;
  const root = safeRoot();
  const english = readTree(path.join(root, 'ozon-tree-en-cache.json'));
  const russian = readTree(path.join(root, 'ozon-tree-ru-cache.json'));
  const merged = new Map();
  for (const item of russian) merged.set(`${item.catId}:${item.typeId}`, item);
  for (const item of english) {
    const key = `${item.catId}:${item.typeId}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, item);
      continue;
    }
    previous.label = item.label;
    previous.leaf = item.leaf;
    previous.hay = `${previous.hay} ${item.hay}`;
  }
  cachedTree = [...merged.values()];
  return cachedTree;
}

const SYNONYMS = {
  face: ['face', 'facial'],
  facial: ['face', 'facial'],
  wash: ['wash', 'cleanser', 'cleansing'],
  cleanser: ['cleanser', 'cleansing', 'wash'],
  cleansing: ['cleansing', 'cleanser', 'wash'],
  cream: ['cream', 'creme'],
  sunscreen: ['sunscreen', 'sun screen', 'spf'],
  lotion: ['lotion'],
  serum: ['serum'],
  shampoo: ['shampoo'],
  soap: ['soap'],
  mask: ['mask'],
};

function variants(token) {
  return SYNONYMS[token] || [token];
}

function matchesToken(hay, token) {
  return variants(token).some((word) => hay.includes(word));
}

function scoreMatch(item, query, tokens) {
  if (!tokens.every((token) => matchesToken(item.hay, token))) return 0;
  let score = 1;
  if (item.leaf === query) score += 80;
  if (matchesToken(item.leaf, query) || item.leaf.includes(query)) score += 40;
  for (const token of tokens) {
    if (matchesToken(item.leaf, token)) score += 12;
  }
  if (String(item.typeId) === query || String(item.catId) === query) score += 100;
  score += Math.max(0, 24 - Math.floor(item.label.length / 12));
  return score;
}

export function knownCategory(catId, typeId) {
  const tree = categoryTree();
  if (!tree.length) return { known: null };
  const match = tree.find((item) => item.catId === Number(catId) && item.typeId === Number(typeId));
  return match ? { known: true, label: match.label } : { known: false };
}

export async function GET(request) {
  const query = String(new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
  if (query.length < 2) {
    return NextResponse.json({ results: [], total: 0, error: 'Enter at least 2 characters.' }, { status: 400 });
  }
  const tree = categoryTree();
  if (!tree.length) {
    return NextResponse.json({
      results: [],
      total: 0,
      error: 'The saved Ozon category list is not available. Enter a category id and type id instead.',
    });
  }
  const tokens = query.split(/\s+/).filter(Boolean);
  const ranked = [];
  for (const item of tree) {
    const score = scoreMatch(item, query, tokens);
    if (score > 0) ranked.push({ score, item });
  }
  ranked.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
  return NextResponse.json({
    total: ranked.length,
    results: ranked.slice(0, 20).map(({ item }) => ({
      catId: item.catId,
      typeId: item.typeId,
      label: item.label,
    })),
  });
}
