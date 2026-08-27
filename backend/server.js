require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');
const { Pool } = require('pg');

const translateRoutes = require('./routes/translate');
const worksheetRoutes = require('./routes/worksheet');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

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