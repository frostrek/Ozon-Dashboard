import { createReadStream } from 'fs';
import { access, readFile, stat } from 'fs/promises';
import path from 'path';
import { GridFSBucket } from 'mongodb';
import { getMongoDb } from '../mongo';

const PERSIST_FILES = [
  'final.pdf',
  '03_report.xlsx',
  '01_data_raw.json',
  '02_data_translated.json',
  'pipeline.log',
];

const BUCKET = 'run-files';

function safeRel(filePathParam) {
  if (!filePathParam) return '';
  return path.normalize(String(filePathParam)).replace(/^(\.\.(\/|\\|$))+/, '').replace(/\\/g, '/');
}

function contentTypeFor(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === '.json') return 'application/json';
  if (ext === '.log') return 'text/plain';
  return 'application/octet-stream';
}

async function getBucket() {
  const db = await getMongoDb();
  return { db, bucket: new GridFSBucket(db, { bucketName: BUCKET }) };
}

export async function persistRunFiles(runDirRel) {
  const relDir = safeRel(runDirRel).replace(/\/+$/, '');
  if (!relDir.startsWith('runs/')) return;
  const { db, bucket } = await getBucket();
  for (const name of PERSIST_FILES) {
    const rel = `${relDir}/${name}`;
    const abs = path.join(process.cwd(), rel);
    try {
      await access(abs);
    } catch {
      continue;
    }
    const existing = await db.collection(`${BUCKET}.files`).find({ filename: rel }).toArray();
    for (const doc of existing) {
      await bucket.delete(doc._id);
    }
    await new Promise((resolve, reject) => {
      createReadStream(abs)
        .pipe(bucket.openUploadStream(rel, { contentType: contentTypeFor(name), metadata: { runDir: relDir } }))
        .on('error', reject)
        .on('finish', resolve);
    });
  }
}

export async function whichRunFilesExist(relPaths) {
  const found = new Set();
  const missing = [];
  for (const raw of relPaths || []) {
    const rel = safeRel(raw);
    if (!rel.startsWith('runs/')) continue;
    try {
      await access(path.join(process.cwd(), rel));
      found.add(rel);
    } catch {
      missing.push(rel);
    }
  }
  if (!missing.length) return found;
  try {
    const { db } = await getBucket();
    const stored = await db.collection(`${BUCKET}.files`).find(
      { filename: { $in: missing } },
      { projection: { filename: 1 } },
    ).toArray();
    for (const doc of stored) found.add(doc.filename);
  } catch {
    // Mongo is optional for listing; download still tries disk.
  }
  return found;
}

export async function listStoredFilenames(relDirRaw) {
  const relDir = safeRel(relDirRaw).replace(/\/+$/, '');
  if (!relDir.startsWith('runs/')) return new Set();
  try {
    const { db } = await getBucket();
    const stored = await db.collection(`${BUCKET}.files`).find(
      { filename: { $regex: `^${relDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/` } },
      { projection: { filename: 1 } },
    ).toArray();
    return new Set(stored.map((doc) => doc.filename));
  } catch {
    return new Set();
  }
}

export async function readStoredRunFile(filePathParam) {
  const rel = safeRel(filePathParam);
  if (!rel.startsWith('runs/')) return null;
  const abs = path.join(process.cwd(), rel);
  try {
    await stat(abs);
    const buffer = await readFile(abs);
    return { buffer, filename: path.basename(rel), contentType: contentTypeFor(rel) };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const { db, bucket } = await getBucket();
  const doc = await db.collection(`${BUCKET}.files`).findOne({ filename: rel });
  if (!doc) return null;
  const chunks = [];
  await new Promise((resolve, reject) => {
    bucket.openDownloadStream(doc._id)
      .on('data', (chunk) => chunks.push(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return {
    buffer: Buffer.concat(chunks),
    filename: path.basename(rel),
    contentType: doc.contentType || contentTypeFor(rel),
  };
}
