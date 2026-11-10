import { NextResponse } from 'next/server';
import { getMongoDb } from '../../../../../lib/mongo';
import { prisma } from '../../../../../lib/prisma';

export async function POST(req) {
  try {
    const { asin } = await req.json();
    if (!asin) {
      return NextResponse.json({ error: 'ASIN is required' }, { status: 400 });
    }

    // 1. Get scraped product from MongoDB
    const db = await getMongoDb();
    const scraped = await db.collection('catalog_products').findOne({ asin });
    if (!scraped) {
      return NextResponse.json({ error: 'Scraped product not found' }, { status: 404 });
    }

    // 2. Get an account to assign to
    const account = await prisma.account.findFirst();
    if (!account) {
      return NextResponse.json({ error: 'No seller account found. Please connect an account first.' }, { status: 400 });
    }

    // 3. Parse images
    let images = [];
    try {
      images = typeof scraped.image_urls === 'string' ? JSON.parse(scraped.image_urls) : (scraped.image_urls || []);
      if (!Array.isArray(images)) images = [];
    } catch {
      images = [];
    }

    // 4. Calculate estimated USD price: (price_inr * 1.8 / 87)
    const inrPrice = Number(scraped.price_inr) || 0;
    const usdPrice = inrPrice > 0 ? Math.round(((inrPrice * 1.8) / 87) * 100) / 100 : 19.99;
    const oldPrice = Math.round(usdPrice * 1.25 * 100) / 100;
    const weightGrams = Number(scraped.weight_grams) || 150;

    // 5. Check if product already exists with this SKU
    const existing = await prisma.product.findFirst({
      where: {
        account_id: account.id,
        sku: asin,
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyExists: true,
        productId: existing.id,
        message: 'Product already in catalog',
      });
    }

    // 6. Create product in Prisma
    const newProduct = await prisma.product.create({
      data: {
        account_id: account.id,
        ozon_id: '',
        sku: asin,
        name: scraped.name || asin,
        brand: scraped.brand || 'Generic',
        price: usdPrice,
        old_price: oldPrice,
        currency: 'USD',
        stock: 100,
        reserved_stock: 0,
        fbo_stock: 0,
        status: 'DRAFT',
        status_name: 'Draft (From Scraper)',
        images_json: JSON.stringify(images),
        attributes_json: JSON.stringify({
          description: scraped.name || '',
          barcode: '',
          weight: weightGrams,
          depth: 100,
          width: 100,
          height: 50,
          weight_unit: 'g',
          dimension_unit: 'mm',
          vat: '0',
          source_asin: asin,
          amazon_url: scraped.amazon_url || `https://www.amazon.in/dp/${asin}`,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      productId: newProduct.id,
      message: 'Product imported to catalog',
    });
  } catch (error) {
    console.error('Import scraped product error:', error);
    return NextResponse.json({ error: error.message || 'Failed to import product' }, { status: 500 });
  }
}

