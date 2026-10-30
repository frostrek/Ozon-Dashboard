import { MongoClient } from 'mongodb';

const globalForMongo = globalThis;

export async function getMongoDb() {
  if (!globalForMongo.__ozonMongo) {
    const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
    const client = new MongoClient(uri);
    await client.connect();
    globalForMongo.__ozonMongo = client.db();
  }
  return globalForMongo.__ozonMongo;
}
