import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { cacheGet, cacheSet } from '../../../../lib/cache/upstash';
import { ozonPost } from '../../../../ozon-http.js';

const DASHBOARD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export const dynamic = 'force-dynamic';

let cachedTree = null;
let loadingTree = null;

function flattenOzonTree(nodes, currentDescCatId = null, currentPath = '') {
  const results = [];
  if (!Array.isArray(nodes)) return results;
  for (const node of nodes) {
    if (node.disabled) continue;
    const descId = node.description_category_id || currentDescCatId;
    const name = node.category_name || node.type_name || 'Unknown';
    const nextPath = currentPath ? `${currentPath} > ${name}` : name;
    if (node.type_id && descId) results.push({ catId: descId, typeId: node.type_id, label: nextPath });
    if (Array.isArray(node.children) && node.children.length) {
      results.push(...flattenOzonTree(node.children, descId, nextPath));
    }
  }
  return results;
}

function mergeTrees(russian, english) {
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
    previous.leaf = item.label.split('>').pop().trim().toLowerCase();
    previous.hay = `${previous.hay} ${item.label}`.toLowerCase();
  }
  return [...merged.values()].map((item) => ({
    catId: Number(item.catId),
    typeId: Number(item.typeId),
    label: String(item.label || '').trim(),
    leaf: String(item.leaf || item.label || '').split('>').pop().trim().toLowerCase(),
    hay: String(item.hay || item.label || '').toLowerCase(),
  })).filter((item) => item.catId && item.typeId && item.label);
}

function categoryTreeFromDisk() {
  const root = safeRoot();
  const english = readTree(path.join(root, 'ozon-tree-en-cache.json'));
  const russian = readTree(path.join(root, 'ozon-tree-ru-cache.json'));
  if (!english.length && !russian.length) return [];
  return mergeTrees(russian, english);
}

async function fetchOzonTree(account, language) {
  const response = await ozonPost(
    'https://api-seller.ozon.ru/v1/description-category/tree',
    { language },
    { 'Client-Id': String(account.client_id), 'Api-Key': account.api_key },
    60_000,
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Ozon category list returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return flattenOzonTree(data.result || []);
}

async function ensureTree() {
  if (cachedTree?.length) return cachedTree;
  const redisTree = await cacheGet('ozon:category-tree:v1');
  if (Array.isArray(redisTree) && redisTree.length) {
    cachedTree = redisTree;
    return cachedTree;
  }
  const disk = categoryTreeFromDisk();
  if (disk.length) {
    cachedTree = disk;
    cacheSet('ozon:category-tree:v1', cachedTree, 60 * 60 * 12).catch(() => {});
    return cachedTree;
  }
  if (!loadingTree) {
    loadingTree = (async () => {
      const account = await prisma.account.findFirst({
        where: { AND: [{ client_id: { not: '' } }, { api_key: { not: '' } }] },
        orderBy: { name: 'asc' },
      });
      if (!account) throw new Error('Add a seller account with an Ozon client id and API key before searching categories.');
      const english = await fetchOzonTree(account, 'EN');
      let russian = [];
      try { russian = await fetchOzonTree(account, 'RU'); } catch { russian = []; }
      cachedTree = mergeTrees(russian, english);
      if (!cachedTree.length) throw new Error('Ozon returned an empty category list.');
      cacheSet('ozon:category-tree:v1', cachedTree, 60 * 60 * 12).catch(() => {});
      return cachedTree;
    })().finally(() => {
      loadingTree = null;
    });
  }
  return loadingTree;
}

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
  return cachedTree || categoryTreeFromDisk();
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
  let tree = [];
  try {
    tree = await ensureTree();
  } catch (error) {
    return NextResponse.json({
      results: [],
      total: 0,
      error: error.message || 'Ozon categories could not be loaded. Use Enter custom ids and type the category id and type id.',
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
