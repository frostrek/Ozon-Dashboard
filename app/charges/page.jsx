import { prisma } from '../../lib/prisma.js';
import ChargesClient from './ChargesClient.jsx';
import { toPlain } from '../../lib/toPlain.js';
import FriendlyError from '../components/FriendlyError.jsx';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ozon Order Charges',
  description: 'Understand how Ozon finance transactions and deductions affect order payouts',
};

export default async function OrderChargesPage() {
  try {
    const accounts = await prisma.account.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return (
      <ChargesClient
        accounts={toPlain(accounts) || []}
      />
    );
  } catch (error) {
    console.error('[charges-page]', error);
    return (
      <FriendlyError
        kind="page"
        message="Ozon order charges could not be loaded from the database or API."
        digest={error?.digest ? String(error.digest) : ''}
      />
    );
  }
}

