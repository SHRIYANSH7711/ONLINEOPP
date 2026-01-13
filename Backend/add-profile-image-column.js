//Backend/add-profile-image-column.js
require('dotenv').config();
const pool = require('./db');

async function addProfileImageColumn() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Adding profile_image column to vendors table...');
    
    await client.query('BEGIN');
    
    // Add profile_image column if it doesn't exist
    await client.query(`
      ALTER TABLE vendors 
      ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500);
    `);
    
    console.log('✅ profile_image column added successfully!');
    
    // Create index for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendors_profile_image 
      ON vendors(profile_image);
    `);
    
    console.log('✅ Index created on profile_image column');
    
    await client.query('COMMIT');
    
    console.log('\n✅ SUCCESS! Migration complete.');
    console.log('   Vendors can now upload profile images.\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addProfileImageColumn()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });