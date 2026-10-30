import { closeCatalogDb, countProducts, dbStats } from '../safe-pipeline/m-local-db.js';

const stats = await dbStats();
const total = await countProducts();
console.log(JSON.stringify({ ...stats, total }));
await closeCatalogDb();
