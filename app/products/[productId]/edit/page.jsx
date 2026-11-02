import { prisma } from '../../../../lib/prisma';
import EditClient from './EditClient';
import { notFound } from 'next/navigation';
import { listingFormFromProduct, refreshListingFromOzon } from '../../../../lib/ozon/loadListing';

export const dynamic = 'force-dynamic';

function toClient(product) {
  return JSON.parse(JSON.stringify({
    ...product,
    account: product.account ? { id: product.account.id, name: product.account.name } : null,
  }));
}

export default async function EditProductPage({ params }) {
  const { productId } = params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { account: true },
  });
  if (!product) notFound();

  const { product: fresh, warning } = await refreshListingFromOzon(product);
  const safe = toClient(fresh);

  return (
    <EditClient
      product={safe}
      account={safe.account}
      initialForm={listingFormFromProduct(fresh)}
      loadWarning={warning || ''}
    />
  );
}
