// Backend/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  statement_timeout: 30000
});

// Event handlers
pool.on('connect', () => console.log('✅ Database connection established'));
pool.on('error', (err) => console.error('❌ Unexpected database error:', err.message));

// Test connection
pool.query('SELECT NOW() as now')
  .then(res => {
    console.log('✅ Database connected successfully!');
    console.log('   Current time:', res.rows[0].now);
    console.log('   Ready to accept requests\n');
  })
  .catch(err => {
    console.error('❌ Database connection FAILED:', err.message);
    console.error('   Connection string host:', new URL(process.env.DATABASE_URL).hostname);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📋 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed gracefully');
  process.exit(0);
});

module.exports = pool;