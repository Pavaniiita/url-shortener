const { Pool } = require('pg');

// const pool = new Pool({
//   host:     process.env.DB_HOST     || 'localhost',
//   port:     parseInt(process.env.DB_PORT) || 5432,
//   database: process.env.DB_NAME     || 'url_shortener',
//   user:     process.env.DB_USER     || 'postgres',
//   password: process.env.DB_PASSWORD || '',
// });

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'url_shortener',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
);

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS urls (
      id          BIGSERIAL PRIMARY KEY,
      short_code  VARCHAR(20) UNIQUE NOT NULL,
      long_url    TEXT NOT NULL,
      custom_alias BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      expires_at  TIMESTAMPTZ,
      is_active   BOOLEAN DEFAULT TRUE
    );

    CREATE INDEX IF NOT EXISTS idx_short_code ON urls(short_code);

    CREATE TABLE IF NOT EXISTS clicks (
      id          BIGSERIAL PRIMARY KEY,
      short_code  VARCHAR(20) NOT NULL,
      clicked_at  TIMESTAMPTZ DEFAULT NOW(),
      ip_address  TEXT,
      user_agent  TEXT,
      referrer    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_clicks_code ON clicks(short_code);
  `);
  console.log('Database tables ready.');
}

module.exports = { pool, initDB };
