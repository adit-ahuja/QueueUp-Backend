const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const connectDB = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected (AWS RDS)');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = { pool, connectDB };
