import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || '';

if (!MONGODB_URI) {
  console.warn('Warning: MONGODB_URI not defined, falling back to in-memory store');
}

interface MongoConnection {
  client: MongoClient;
  db: Db;
}

// Global cache for connection (persist across serverless invocations)
const globalForMongo = globalThis as unknown as {
  mongoConnection: MongoConnection | null;
  mongoPromise: Promise<MongoConnection> | null;
};

globalForMongo.mongoConnection = globalForMongo.mongoConnection || null;
globalForMongo.mongoPromise = globalForMongo.mongoPromise || null;

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
    const client = new MongoClient(MONGODB_URI, {
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
