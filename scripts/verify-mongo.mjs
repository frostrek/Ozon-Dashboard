import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';

const prisma = new PrismaClient();
const client = new MongoClient(process.env.MONGODB_URI || process.env.DATABASE_URL);
try {
  const [accounts, orders, products] = await Promise.all([
    prisma.account.count(),
    prisma.order.count(),
    prisma.product.count(),
  ]);
  await client.connect();
  const catalog = await client.db().collection('catalog_products').countDocuments();
  console.log(JSON.stringify({ accounts, orders, products, catalog }));
} finally {
  await prisma.$disconnect();
  await client.close();
}
