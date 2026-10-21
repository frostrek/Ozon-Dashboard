import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const [count, avgs, samples] = await Promise.all([
        prisma.product.count(),
        prisma.product.aggregate({ _avg: { content_rating: true, stock: true, sales: true, price: true } }),
        prisma.product.findMany({ where: { brand: { not: null } }, select: { brand: true, category_name: true, health: true, images_json: true, stock: true, sales: true, content_rating: true }, take: 10 }),
    ]);
    console.log('Total products:', count);
    console.log('Avgs:', JSON.stringify(avgs._avg, null, 2));
    console.log('Sample products:', JSON.stringify(samples.slice(0, 3), null, 2));
    const outOfStock = await prisma.product.count({ where: { stock: 0 } });
    const lowRating = await prisma.product.count({ where: { content_rating: { lt: 60 } } });
    const noBrand = await prisma.product.count({ where: { OR: [{ brand: null }, { brand: '' }] } });
    console.log('Out of stock:', outOfStock, '| Low rating:', lowRating, '| No brand:', noBrand);
}

main().catch(console.error).finally(() => prisma.$disconnect());
