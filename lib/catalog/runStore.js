import { getMongoDb } from '../mongo.js';

const COLLECTION = 'catalog_runs';

export async function saveCatalogRun(runId, patch) {
  const id = String(runId || '').trim();
  if (!id) return;
  const set = { updatedAt: new Date().toISOString() };
  if (patch?.job) set.job = patch.job;
  if (patch?.status) set.status = patch.status;
  if (Array.isArray(patch?.products)) set.products = patch.products;
  const db = await getMongoDb();
  await db.collection(COLLECTION).updateOne(
    { _id: id },
    { $set: set },
    { upsert: true },
  );
}

export async function loadCatalogRun(runId) {
  const id = String(runId || '').trim();
  if (!id) return null;
  const db = await getMongoDb();
  return db.collection(COLLECTION).findOne({ _id: id });
}

export async function listCatalogRunDocs() {
  const db = await getMongoDb();
  return db.collection(COLLECTION).find({}).toArray();
}

export async function deleteCatalogRunDoc(runId) {
  const id = String(runId || '').trim();
  if (!id) return;
  const db = await getMongoDb();
  await db.collection(COLLECTION).deleteOne({ _id: id });
}
