import { NextResponse } from 'next/server';
import { deleteSellerAccount } from '../../../../lib/accounts/deleteAccount';

export const dynamic = 'force-dynamic';

export async function DELETE(_request, { params }) {
  try {
    const result = await deleteSellerAccount(params?.id);
    if (!result.deleted) {
      return NextResponse.json({ error: 'That account was not found.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'The account could not be deleted.' }, { status: 500 });
  }
}
