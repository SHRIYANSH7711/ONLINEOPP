// backend/add-amul.js
require('dotenv').config();
const pool = require('./db');

async function addAmul() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add Amul vendor
    const vendorResult = await client.query(`
      INSERT INTO vendors (outlet_name, is_active)
      VALUES ('Amul', true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    let amulId;
    if (vendorResult.rows.length > 0) {
      amulId = vendorResult.rows[0].id;
      console.log('✅ Amul outlet created with ID:', amulId);
    } else {
      // Outlet already exists, get ID
      const existing = await client.query(
        "SELECT id FROM vendors WHERE outlet_name = 'Amul'"
      );
      amulId = existing.rows[0].id;
      console.log('ℹ️  Amul outlet already exists with ID:', amulId);
    }

    // Add Amul menu items
    const items = [
      { name: 'Amul Ice Cream - Vanilla', price: 40.00, category: 'Ice Cream', description: 'Classic vanilla ice cream' },
      { name: 'Amul Ice Cream - Chocolate', price: 45.00, category: 'Ice Cream', description: 'Rich chocolate ice cream' },
      { name: 'Amul Ice Cream - Butterscotch', price: 45.00, category: 'Ice Cream', description: 'Creamy butterscotch ice cream' },
      { name: 'Amul Ice Cream - Strawberry', price: 45.00, category: 'Ice Cream', description: 'Fresh strawberry ice cream' },
      { name: 'Amul Ice Cream - Kesar Pista', price: 50.00, category: 'Ice Cream', description: 'Saffron and pistachio ice cream' },
      { name: 'Amul Kulfi', price: 30.00, category: 'Ice Cream', description: 'Traditional Indian ice cream' },
      { name: 'Coca Cola', price: 40.00, category: 'Cold Drinks', description: '300ml bottle' },
      { name: 'Pepsi', price: 40.00, category: 'Cold Drinks', description: '300ml bottle' },
      { name: 'Sprite', price: 40.00, category: 'Cold Drinks', description: '300ml bottle' },
      { name: 'Frooti', price: 20.00, category: 'Cold Drinks', description: 'Mango drink' },
      { name: 'Amul Kool', price: 25.00, category: 'Cold Drinks', description: 'Flavored milk' },
      { name: 'Veg Patties', price: 35.00, category: 'Snacks', description: 'Crispy vegetable patties' },
      { name: 'Pizza Patties', price: 40.00, category: 'Snacks', description: 'Pizza flavored patties' },
      { name: 'Paneer Patties', price: 45.00, category: 'Snacks', description: 'Cottage cheese patties' },
      { name: 'Burger', price: 50.00, category: 'Snacks', description: 'Veg burger' },
      { name: 'Sandwich', price: 40.00, category: 'Snacks', description: 'Grilled veg sandwich' },
      { name: 'Amul Milk', price: 25.00, category: 'Dairy', description: '500ml packet' },
      { name: 'Amul Lassi', price: 30.00, category: 'Dairy', description: 'Sweet lassi' },
      { name: 'Amul Butter', price: 60.00, category: 'Dairy', description: '100g pack' }
    ];

    for (const item of items) {
      await client.query(`
        INSERT INTO menu_items (vendor_id, name, price, category, description, is_available)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (vendor_id, name, price) DO NOTHING
      `, [amulId, item.name, item.price, item.category, item.description]);
    }

    await client.query('COMMIT');
    console.log('✅ Amul menu items added successfully!');
    console.log(`   Added ${items.length} items`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding Amul:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

addAmul();