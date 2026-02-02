
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined');
  process.exit(1);
}

async function testConnection() {
  console.log('Testing connection to:', MONGODB_URI.replace(/:([^@]+)@/, ':****@'));
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    console.log('Connected successfully to MongoDB');
    const db = client.db('summonchess');
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.close();
  }
}

testConnection();
