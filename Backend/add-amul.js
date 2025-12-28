require('dotenv').config();
const pool = require('./db');

async function addAmul() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🔄 Checking for Amul outlet...');

    // Check if Amul exists
    const existing = await client.query(
      "SELECT id, is_active FROM vendors WHERE outlet_name = 'Amul'"
    );

    let amulId;
    if (existing.rows.length > 0) {
      amulId = existing.rows[0].id;
      console.log('ℹ️  Amul outlet already exists with ID:', amulId);
      
      // Make sure it's active
      await client.query(
        "UPDATE vendors SET is_active = true WHERE id = $1",
        [amulId]
      );
      console.log('✅ Amul outlet set to active');
    } else {
      // Add Amul vendor
      const vendorResult = await client.query(`
        INSERT INTO vendors (outlet_name, is_active)
        VALUES ('Amul', true)
        RETURNING id
      `);
      amulId = vendorResult.rows[0].id;
      console.log('✅ Amul outlet created with ID:', amulId);
    }

    // Check if menu items exist
    const menuCheck = await client.query(
      'SELECT COUNT(*) FROM menu_items WHERE vendor_id = $1',
      [amulId]
    );

    if (parseInt(menuCheck.rows[0].count) > 0) {
      console.log(`ℹ️  Amul already has ${menuCheck.rows[0].count} menu items`);
      await client.query('COMMIT');
      console.log('✅ All done! Amul is ready.');
      return;
    }

    // Add Amul menu items
    console.log('📝 Adding Amul menu items...');
    
    const items = [
      // Ice Creams
      { name: 'Amul Ice Cream - Vanilla', price: 40.00, category: 'Ice Cream', description: 'Classic vanilla ice cream', image_url: null },
      { name: 'Amul Ice Cream - Chocolate', price: 45.00, category: 'Ice Cream', description: 'Rich chocolate ice cream', image_url: null },
      { name: 'Amul Ice Cream - Butterscotch', price: 45.00, category: 'Ice Cream', description: 'Creamy butterscotch ice cream', image_url: null },
      { name: 'Amul Ice Cream - Strawberry', price: 45.00, category: 'Ice Cream', description: 'Fresh strawberry ice cream', image_url: null },
      { name: 'Amul Ice Cream - Kesar Pista', price: 50.00, category: 'Ice Cream', description: 'Saffron and pistachio ice cream', image_url: null },
      { name: 'Amul Kulfi', price: 30.00, category: 'Ice Cream', description: 'Traditional Indian ice cream', image_url: null },
      
      // Cold Drinks
      { name: 'Coca Cola', price: 40.00, category: 'Cold Drinks', description: '300ml bottle', image_url: null },
      { name: 'Pepsi', price: 40.00, category: 'Cold Drinks', description: '300ml bottle', image_url: null },
      { name: 'Sprite', price: 40.00, category: 'Cold Drinks', description: '300ml bottle', image_url: null },
      { name: 'Frooti', price: 20.00, category: 'Cold Drinks', description: 'Mango drink', image_url: null },
      { name: 'Amul Kool', price: 25.00, category: 'Cold Drinks', description: 'Flavored milk', image_url: null },
      
      // Snacks
      { name: 'Veg Patties', price: 35.00, category: 'Snacks', description: 'Crispy vegetable patties', image_url: null },
      { name: 'Pizza Patties', price: 40.00, category: 'Snacks', description: 'Pizza flavored patties', image_url: null },
      { name: 'Paneer Patties', price: 45.00, category: 'Snacks', description: 'Cottage cheese patties', image_url: null },
      { name: 'Burger', price: 50.00, category: 'Snacks', description: 'Veg burger', image_url: null },
      { name: 'Sandwich', price: 40.00, category: 'Snacks', description: 'Grilled veg sandwich', image_url: null },
      
      // Dairy
      { name: 'Amul Milk', price: 25.00, category: 'Dairy', description: '500ml packet', image_url: null },
      { name: 'Amul Lassi', price: 30.00, category: 'Dairy', description: 'Sweet lassi', image_url: null },
      { name: 'Amul Butter', price: 60.00, category: 'Dairy', description: '100g pack', image_url: null }
    ];

    let addedCount = 0;
    for (const item of items) {
      await client.query(`
        INSERT INTO menu_items (vendor_id, name, price, category, description, image_url, is_available)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (vendor_id, name, price) DO NOTHING
      `, [amulId, item.name, item.price, item.category, item.description, item.image_url]);
      addedCount++;
    }

    await client.query('COMMIT');
    console.log(`✅ Added ${addedCount} menu items to Amul!`);
    console.log('✅ Amul is now fully set up and available!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Amul:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

addAmul();