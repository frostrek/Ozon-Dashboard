import { prisma } from '../../lib/prisma';
import ProductsClient from './ProductsClient';
import FriendlyError from '../components/FriendlyError';

export const dynamic = 'force-dynamic';

function textParam(value, fallback) {
  const text = Array.isArray(value) ? value[0] : value;
  return text == null || text === '' ? fallback : String(text);
}

export default async function ProductsPage({ searchParams }) {
  const tab = textParam(searchParams?.tab, 'ALL');
  const account = textParam(searchParams?.account, 'all');
  const list = textParam(searchParams?.list, 'all');
  const q = textParam(searchParams?.q, '');

  try {
    const accountRows = await prisma.account.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const accounts = accountRows.map((row) => ({
      id: String(row.id),
      name: String(row.name || 'Untitled account'),
    }));

    if (!accounts.length) {
      return <FriendlyError kind="no-account" />;
    }

    return (
      <ProductsClient
        initialTab={tab}
        initialAccount={account}
        initialList={list}
        initialQuery={q}
        accounts={accounts}
      />
    );
  } catch (error) {
    console.error('[products-page]', error);
    return (
      <FriendlyError
        kind="page"
        message="Products could not be loaded from the database."
        digest={error?.digest ? String(error.digest) : ''}
      />
    );
  }
}
