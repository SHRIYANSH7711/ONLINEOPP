// Backend/db.js
const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 DNS resolution
dns.setDefaultResultOrder('ipv4first');

// Parse connection details
const dbConfig = {
  host: 'db.kxwfrllipcoglvxulctj.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '0123456789Shriyansh',
  ssl: {
    rejectUnauthorized: false
  },
  // Connection pool settings
  max: 20,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  statement_timeout: 30000
};

const pool = new Pool(dbConfig);

// Connection event handlers
pool.on('connect', () => {
  console.log('✅ Database connection established');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
});

// Test connection on startup with retry logic
async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as now');
      client.release();
      
      console.log('✅ Database connected successfully!');
      console.log('   Current time:', result.rows[0].now);
      console.log('   Ready to accept requests\n');
      return true;
    } catch (err) {
      console.error(`❌ Connection attempt ${i + 1}/${retries} failed:`, err.message);
      
      if (i === retries - 1) {
        console.error('   All connection attempts failed');
        console.error('   Host:', dbConfig.host);
        console.error('   Port:', dbConfig.port);
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  return false;
}

testConnection();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📋 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed gracefully');
  process.exit(0);
});

module.exports = pool;