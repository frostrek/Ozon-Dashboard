import { getMongoDb } from '../mongo';

function dayKey(offsetDays) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function filterFor({ q, brand, status, date }) {
  const filter = {};
  const text = String(q || '').trim();
  if (text) {
    const pattern = escapeRegex(text);
    filter.$or = ['name', 'asin', 'brand'].map((field) => ({ [field]: { $regex: pattern, $options: 'i' } }));
  }
  if (brand && brand !== 'all') filter.brand = brand;
  if (status === 'enriched' || status === 'blocked_weight') filter.scrape_status = status;
  if (date === 'today') filter.scraped_at = { $regex: `^${dayKey(0)}` };
  else if (date === 'yesterday') filter.scraped_at = { $regex: `^${dayKey(-1)}` };
  else if (date === 'week') filter.scraped_at = { $gte: dayKey(-6) };
  else if (date === 'month') filter.scraped_at = { $gte: dayKey(-29) };
  return filter;
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

export async function listScrapedProducts({ q = '', brand = 'all', status = 'all', date = 'all', page = 1, pageSize = 100 } = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || 100));
  const empty = { products: [], total: 0, page: 1, pageCount: 1, pageSize: size, brands: [], hasMore: false };
  try {
    const collection = (await getMongoDb()).collection('catalog_products');
    const filter = filterFor({ q, brand, status, date });
    const total = await collection.countDocuments(filter);
    const pageCount = Math.max(1, Math.ceil(total / size));
    const current = Math.max(1, Number(page) || 1);
    if (current > pageCount || total === 0) {
      const brands = await collection.distinct('brand', { brand: { $nin: [null, ''] } });
      brands.sort((left, right) => String(left).localeCompare(String(right)));
      return { ...empty, total, page: current, pageCount, brands };
    }
    const rows = await collection
      .find(filter, { projection: { asin: 1, name: 1, brand: 1, image_urls: 1, amazon_url: 1, price_inr: 1, weight_grams: 1, scrape_status: 1, scraped_at: 1 } })
      .sort({ scraped_at: -1, asin: 1 })
      .skip((current - 1) * size)
      .limit(size)
      .toArray();
    const brands = await collection.distinct('brand', { brand: { $nin: [null, ''] } });
    brands.sort((left, right) => String(left).localeCompare(String(right)));
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
      hasMore: current * size < total,
      brands,
    };
  } catch {
    return empty;
  }
}
