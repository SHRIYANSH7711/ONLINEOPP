// Backend/add-amul-outlet.js

require('dotenv').config();
const pool = require('./db');

async function addAmulOutlet() {
  const client = await pool.connect();
  
  try {
    console.log('🏪 Adding Amul outlet...');
    
    await client.query('BEGIN');
    
    // 1. Add Amul outlet to vendors table
    const vendorResult = await client.query(`
      INSERT INTO vendors (outlet_name, is_active, is_online, wallet_balance, upi_id)
      VALUES ('Amul', true, false, 0.00, NULL)
      RETURNING id, outlet_name
    `);
    
    const amulId = vendorResult.rows[0].id;
    const amulName = vendorResult.rows[0].outlet_name;
    
    console.log(`✅ Created outlet: ${amulName} (ID: ${amulId})`);
    
    // 2. Add sample menu items for Amul
    const menuItems = [
      { name: 'Amul Kool Badam', price: 20, category: 'Beverages', description: 'Refreshing badam milk' },
      { name: 'Amul Kool Cafe', price: 20, category: 'Beverages', description: 'Chilled coffee drink' },
      { name: 'Amul Lassi', price: 25, category: 'Beverages', description: 'Traditional sweet lassi' },
      { name: 'Amul Buttermilk', price: 15, category: 'Beverages', description: 'Masala chaas' },
      { name: 'Amul Ice Cream Cone', price: 30, category: 'Dessert', description: 'Classic vanilla cone' },
      { name: 'Amul Choco Bar', price: 35, category: 'Dessert', description: 'Chocolate ice cream bar' },
      { name: 'Amul Kulfi', price: 40, category: 'Dessert', description: 'Traditional malai kulfi' },
      { name: 'Amul Milk 500ml', price: 30, category: 'Beverages', description: 'Fresh Amul gold milk' },
      { name: 'Amul Cheese Slice', price: 50, category: 'Snacks', description: 'Pack of cheese slices' },
      { name: 'Amul Butter 100g', price: 60, category: 'Snacks', description: 'Utterly butterly delicious' }
    ];
    
    for (const item of menuItems) {
      await client.query(`
        INSERT INTO menu_items (vendor_id, name, price, description, category, is_available, image_url)
        VALUES ($1, $2, $3, $4, $5, true, NULL)
      `, [amulId, item.name, item.price, item.description, item.category]);
    }
    
    console.log(`✅ Added ${menuItems.length} menu items for Amul`);
    
    await client.query('COMMIT');
    
    console.log('\n✅ SUCCESS! Amul outlet has been added to your system.');
    console.log('\n📋 What to do next:');
    console.log('   1. Refresh your dashboard - Amul will appear in outlet selection');
    console.log('   2. Signup as vendor and select "Amul" outlet');
    console.log('   3. Students/teachers will see Amul items in their menu\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Amul outlet:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addAmulOutlet()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });