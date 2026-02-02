import { MongoClient, Db } from 'mongodb';

interface MongoConnection {
  client: MongoClient;
  db: Db;
}

// Global cache for connection (persist across serverless invocations)
const globalForMongo = globalThis as unknown as {
  mongoConnection: MongoConnection | null;
  mongoPromise: Promise<MongoConnection> | null;
};

if (!globalForMongo.mongoConnection) globalForMongo.mongoConnection = null;
if (!globalForMongo.mongoPromise) globalForMongo.mongoPromise = null;

export async function connectToDatabase(): Promise<MongoConnection> {
  // Return cached connection if available
  if (globalForMongo.mongoConnection) {
    return globalForMongo.mongoConnection;
  }

  // Return pending promise if connection is in progress
  if (globalForMongo.mongoPromise) {
    return globalForMongo.mongoPromise;
  }

  // Create new connection
  globalForMongo.mongoPromise = (async () => {
    const uri = (process.env.MONGODB_URI || '').trim();

    if (!uri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
    });

    await client.connect();
    const db = client.db('summonchess');

    globalForMongo.mongoConnection = { client, db };
    return globalForMongo.mongoConnection;
  })();

  return globalForMongo.mongoPromise;
}

// Get database instance
export async function getDb(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}

// Collection names
export const COLLECTIONS = {
  GAMES: 'games',
  ROOMS: 'rooms',
  USERS: 'users',
} as const;
