// backend/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds
  statement_timeout: 30000, // 30 seconds for queries
});

// Connection event handlers
pool.on('connect', () => {
  console.log('✅ Database connection established');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
});

// Test connection on startup
pool.query('SELECT NOW() as now', (err, res) => {
  if (err) {
    console.error('❌ Database connection FAILED:', err.message);
    console.error('   Please check your DATABASE_URL in .env file');
    console.error('   Current connection string:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
  } else {
    console.log('✅ Database connected successfully!');
    console.log('   Current time:', res.rows[0].now);
    console.log('   Ready to accept requests\n');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📋 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed gracefully');
  process.exit(0);
});

module.exports = pool;