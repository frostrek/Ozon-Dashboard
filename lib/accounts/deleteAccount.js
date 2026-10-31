import { getMongoDb } from '../mongo';

export async function deleteSellerAccount(id) {
  const accountId = String(id || '').trim();
  if (!accountId) return { deleted: false };
  const db = await getMongoDb();
  for (const name of ['Account', 'accounts']) {
    try {
      const result = await db.collection(name).deleteOne({ _id: accountId });
      if (result.deletedCount) return { deleted: true };
    } catch {
      // Try the next collection name Prisma may have used.
    }
  }
  return { deleted: false };
}
