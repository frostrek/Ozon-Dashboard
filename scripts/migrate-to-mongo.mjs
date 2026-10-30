import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';

const root = process.cwd();
const dashboardDb = path.join(root, 'prisma', 'dev.db');
const catalogDb = path.join(root, 'safe-pipeline', 'ozon-pipeline.db');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');

function fieldsFromSchema(text) {
  const models = new Map();
  let table = '';
  for (const line of text.split(/\r?\n/)) {
    const model = line.match(/^model\s+(\w+)/);
    if (model) {
      table = model[1];
      models.set(table, { dates: new Set(), bools: new Set() });
      continue;
    }
    const mapped = line.match(/@@map\("([^"]+)"\)/);
    if (mapped && table && models.has(table)) {
      const spec = models.get(table);
      models.delete(table);
      models.set(mapped[1], spec);
      table = mapped[1];
      continue;
    }
    const field = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s+(DateTime|Boolean)\b/);
    if (field && table && models.has(table)) {
      const spec = models.get(table);
      if (field[2] === 'DateTime') spec.dates.add(field[1]);
      else spec.bools.add(field[1]);
    }
  }
  return models;
}

function asDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== '' && Math.abs(numeric) > 10_000_000_000
    ? new Date(numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function documentFrom(row, spec) {
  const doc = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') {
      doc._id = value;
      continue;
    }
    if (value == null) {
      doc[key] = null;
      continue;
    }
    if (spec?.bools.has(key)) {
      doc[key] = value === true || value === 1 || value === '1';
      continue;
    }
    if (spec?.dates.has(key)) {
      doc[key] = asDate(value);
      continue;
    }
    doc[key] = value;
  }
  return doc;
}

async function copySqlite(client, file, { prefix = '', models = new Map() } = {}) {
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name`).all();
  const summary = [];
  try {
    for (const { name } of tables) {
      const rows = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all();
      const collectionName = `${prefix}${name}`;
      const collection = client.db().collection(collectionName);
      await collection.deleteMany({});
      const spec = models.get(name);
      const docs = rows.map((row) => {
        if (prefix) return { ...row, _id: row.id || row.asin || row.progress_key || row.ozon_id };
        return documentFrom(row, spec);
      }).filter((doc) => doc._id != null);
      for (let index = 0; index < docs.length; index += 500) {
        const batch = docs.slice(index, index + 500);
        if (batch.length) await collection.insertMany(batch, { ordered: false });
      }
      summary.push(`${collectionName}: ${docs.length}`);
    }
  } finally {
    db.close();
  }
  return summary;
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is missing.');
  process.exit(1);
}

const client = new MongoClient(uri);
const models = fieldsFromSchema(readFileSync(schemaPath, 'utf8'));
try {
  await client.connect();
  await client.db().command({ ping: 1 });
  const dashboard = await copySqlite(client, dashboardDb, { models });
  const catalog = await copySqlite(client, catalogDb, { prefix: 'catalog_' });
  console.log(dashboard.concat(catalog).join('\n'));
  console.log('Migration finished.');
} finally {
  await client.close();
}
