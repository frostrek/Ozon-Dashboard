import { importStoredProducts } from './importBatch.js';

export async function importProductToOzon(product, account) {
  const report = await importStoredProducts([{ ...product, account, account_id: product.account_id || account.id }]);
  const row = report.results[0];
  if (!row || row.status === 'failed') {
    const error = new Error(row?.error || 'Ozon did not accept this product.');
    error.status = 400;
    throw error;
  }
  return row;
}
