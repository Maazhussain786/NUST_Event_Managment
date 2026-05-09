import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'event_management';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export async function getMongoClient() {
  if (!uri) return null;

  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }

  return global._mongoClientPromise;
}

export async function getMongoDb() {
  try {
    const client = await getMongoClient();
    return client ? client.db(dbName) : null;
  } catch (error) {
    console.error('Mongo connection failed:', error);
    global._mongoClientPromise = undefined;
    return null;
  }
}
