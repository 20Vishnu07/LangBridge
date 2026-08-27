require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const translateRoutes = require('./routes/translate');
const worksheetRoutes = require('./routes/worksheet');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple in-memory cache fallback (Redis optional)
class MemoryCache {
  constructor() {
    this.cache = new Map();
  }
  async get(key) {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) {
      return entry.value;
    }
    this.cache.delete(key);
    return null;
  }
  async setEx(key, ttl, value) {
    this.cache.set(key, { value, expiry: Date.now() + ttl * 1000 });
  }
}

let redis;
try {
  const Redis = require('ioredis');
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 2000,
  });
  redis.on('error', () => {
    console.log('Redis unavailable, using in-memory cache');
    redis = new MemoryCache();
  });
  redis.on('connect', () => console.log('Redis connected'));
} catch (e) {
  console.log('Redis not available, using in-memory cache');
  redis = new MemoryCache();
}

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vaanisetu'
});

pgPool.on('error', (err) => console.error('Postgres error:', err));

async function initDb() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS unresolved_terms (
      id SERIAL PRIMARY KEY,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      confidence REAL NOT NULL,
      src_lang VARCHAR(20) DEFAULT 'hin_Deva',
      tgt_lang VARCHAR(20) DEFAULT 'sat_Olck',
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Database tables initialized');
}

initDb().catch(console.error);

app.locals.redis = redis;
app.locals.pgPool = pgPool;

app.use('/api/translate', translateRoutes);
app.use('/api/worksheet', worksheetRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'vaanisetu-backend' });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

module.exports = app;