import { prisma } from '../../../../lib/prisma';
import EditClient from './EditClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }) {
    const { productId } = params;

    const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { account: true }
    });

    if (!product) notFound();

    return <EditClient product={product} account={product.account} />;
}
