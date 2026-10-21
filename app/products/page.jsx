import { prisma } from '../../lib/prisma';
import ProductsClient from './ProductsClient';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const [dbProducts, accounts] = await Promise.all([
    prisma.product.findMany({
      orderBy: [
        { updated_at: 'desc' },
        { created_at: 'desc' },
      ],
      select: {
        id: true,
        account_id: true,
        ozon_id: true,
        sku: true,
        name: true,
        brand: true,
        price: true,
        old_price: true,
        currency: true,
        stock: true,
        reserved_stock: true,
        fbo_stock: true,
        rating: true,
        content_rating: true,
        status: true,
        status_name: true,
        variant_group_id: true,
        ozon_created_at: true,
        created_at: true,
        updated_at: true,
        images_json: true,
        attributes_json: true,
        account: { select: { name: true } },
      },
    }),
    prisma.account.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const clientProducts = dbProducts.map((product) => ({
    ...product,
    account_name: product.account?.name || null,
    account: undefined,
  }));

  return <ProductsClient initialProducts={clientProducts} accounts={accounts} />;
}
