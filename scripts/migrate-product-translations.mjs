/**
 * Background migration script to translate product names in MongoDB into English.
 * Run with: node --env-file=.env scripts/migrate-product-translations.mjs
 */
import { PrismaClient } from '@prisma/client';
import { translateBulk } from '../lib/labels/utils/translate.js';

const prisma = new PrismaClient();
const BATCH_SIZE = 50;

async function migrate() {
  console.log('[Migration] Starting product translation migration...');
  let totalProcessed = 0;
  let totalUpdated = 0;

  while (true) {
    // Find products containing Cyrillic characters
    const products = await prisma.product.findMany({
      where: {
        name: { contains: '' }, // scan chunk
      },
      select: { id: true, name: true },
      take: 200,
      skip: totalProcessed,
    });

    if (!products.length) break;

    const cyrillicProducts = products.filter((p) => p.name && /[а-яА-ЯёЁ]/.test(p.name));
    if (cyrillicProducts.length > 0) {
      const uniqueNames = [...new Set(cyrillicProducts.map((p) => p.name))];
      const translated = await translateBulk(uniqueNames);
      const nameMap = new Map();
      uniqueNames.forEach((orig, idx) => {
        nameMap.set(orig, translated[idx] || orig);
      });

      for (const p of cyrillicProducts) {
        const englishName = nameMap.get(p.name);
        if (englishName && englishName !== p.name) {
          await prisma.product.update({
            where: { id: p.id },
            data: { name: englishName },
          });
          totalUpdated++;
        }
      }
    }

    totalProcessed += products.length;
    console.log(`[Migration] Scanned ${totalProcessed} products, updated ${totalUpdated} to English.`);
  }

  console.log(`[Migration] Finished! Total updated: ${totalUpdated}`);
  await prisma.$disconnect();
}

migrate().catch((err) => {
  console.error('[Migration] Error:', err);
  prisma.$disconnect();
});

