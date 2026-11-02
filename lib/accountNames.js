import { prisma } from './prisma';

export async function accountNamesById(ids) {
  const unique = [...new Set((ids || []).map((id) => String(id || '')).filter(Boolean))];
  if (!unique.length) return {};
  const rows = await prisma.account.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.name || 'Untitled account']));
}
