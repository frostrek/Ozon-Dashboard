import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const DB_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'safe-pipeline', 'ozon-pipeline.db');

function openDb() {
  if (!existsSync(DB_PATH)) return null;
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

function dayKey(offsetDays) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function whereFor({ q, brand, status, date }) {
  const clauses = [];
  const params = [];
  const text = String(q || '').trim();
  if (text) {
    clauses.push('(lower(name) LIKE ? OR lower(asin) LIKE ? OR lower(ifnull(brand, \'\')) LIKE ?)');
    const like = `%${text.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (brand && brand !== 'all') {
    clauses.push('brand = ?');
    params.push(brand);
  }
  if (status === 'enriched' || status === 'blocked_weight') {
    clauses.push('scrape_status = ?');
    params.push(status);
  }
  if (date === 'today') {
    clauses.push('substr(scraped_at, 1, 10) = ?');
    params.push(dayKey(0));
  } else if (date === 'yesterday') {
    clauses.push('substr(scraped_at, 1, 10) = ?');
    params.push(dayKey(-1));
  } else if (date === 'week') {
    clauses.push('substr(scraped_at, 1, 10) >= ?');
    params.push(dayKey(-6));
  } else if (date === 'month') {
    clauses.push('substr(scraped_at, 1, 10) >= ?');
    params.push(dayKey(-29));
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function imageOf(value) {
  try {
    const urls = JSON.parse(value || '[]');
    const url = Array.isArray(urls) ? urls.find((item) => /^https?:\/\//i.test(String(item || ''))) : '';
    return url ? String(url) : '';
  } catch {
    return '';
  }
}

export function listScrapedProducts({ q = '', brand = 'all', status = 'all', date = 'all', page = 1, pageSize = 20 } = {}) {
  const size = [10, 20, 50].includes(Number(pageSize)) ? Number(pageSize) : 20;
  const db = openDb();
  if (!db) {
    return { products: [], total: 0, page: 1, pageCount: 1, pageSize: size, brands: [] };
  }
  try {
    const filter = whereFor({ q, brand, status, date });
    const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM products ${filter.sql}`).get(...filter.params)?.count || 0);
    const pageCount = Math.max(1, Math.ceil(total / size));
    const current = Math.min(Math.max(1, Number(page) || 1), pageCount);
    const rows = db.prepare(`
      SELECT asin, name, brand, image_urls, amazon_url, price_inr, weight_grams, scrape_status, scraped_at
      FROM products
      ${filter.sql}
      ORDER BY scraped_at DESC, asin ASC
      LIMIT ? OFFSET ?
    `).all(...filter.params, size, (current - 1) * size);
    const brands = db.prepare(`
      SELECT DISTINCT brand FROM products
      WHERE brand IS NOT NULL AND trim(brand) != ''
      ORDER BY brand ASC
    `).all().map((row) => row.brand);
    return {
      products: rows.map((row) => ({
        asin: row.asin,
        name: row.name || '',
        brand: row.brand || '',
        imageUrl: imageOf(row.image_urls),
        amazonUrl: row.amazon_url || (row.asin ? `https://www.amazon.in/dp/${row.asin}` : ''),
        priceInr: row.price_inr ?? null,
        weightGrams: row.weight_grams ?? null,
        status: row.scrape_status || '',
        scrapedAt: row.scraped_at || '',
      })),
      total,
      page: current,
      pageCount,
      pageSize: size,
      brands,
    };
  } finally {
    db.close();
  }
}
