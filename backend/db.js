require('dotenv').config();
const { Pool } = require('pg');

const isRemoteDb = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ...(isRemoteDb ? { ssl: { rejectUnauthorized: false } } : {}),
});

module.exports = pool;
