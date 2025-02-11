import { MongoClient } from 'mongodb';

import { config } from 'dotenv';

config();

const mongoURI = process.env.MONGO_URI;
const db_name = process.env.DB_NAME;

async function connectToDatabase() {
  try {
      const client = new MongoClient(mongoURI);
      await client.connect();
      return { client, db: client.db(db_name) };
  } catch (error) {
      console.error("Database connection failed:", error);
      return { client: null, db: null }; // Ensure we return an object
  }
}

export { connectToDatabase };