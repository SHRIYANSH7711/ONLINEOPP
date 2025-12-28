// backend/setup.js
require('dotenv').config();
const pool = require('./db');

async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('Setting up database...');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'customer',
        wallet_balance DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        outlet_name VARCHAR(100) NOT NULL,
        owner_user_id INTEGER REFERENCES users(id),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_users (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(50) DEFAULT 'manager',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(vendor_id, user_id)
      );
    `);
      
    console.log('✅ Vendor users junction table created');
      
    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_users_vendor 
      ON vendor_users(vendor_id);
      
      CREATE INDEX IF NOT EXISTS idx_vendor_users_user 
      ON vendor_users(user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER REFERENCES vendors(id),
        name VARCHAR(200) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description TEXT,
        image_url VARCHAR(500),
        is_available BOOLEAN DEFAULT TRUE,
        category VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(vendor_id, name, price)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        token VARCHAR(50) UNIQUE NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(20) DEFAULT 'wallet',
        order_date DATE DEFAULT CURRENT_DATE,
        order_of_day INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        menu_item_id INTEGER REFERENCES menu_items(id),
        qty INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        vendor_id INTEGER REFERENCES vendors(id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_counters (
        order_date DATE PRIMARY KEY,
        counter INTEGER DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        amount DECIMAL(10,2) NOT NULL,
        type VARCHAR(10) NOT NULL,
        description TEXT,
        reference_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'general',
        reference_id VARCHAR(100),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Update vendors table for wallet and UPI
    await client.query(`
      ALTER TABLE vendors 
      ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(10,2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100);
      `);
      
      // Create vendor transactions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS vendor_transactions (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        type VARCHAR(10) NOT NULL,
        description TEXT,
        reference_id VARCHAR(100),
        payment_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
        );
        `);
        
        // Add Razorpay fields to orders table
        await client.query(`
          ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100),
          ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100);
          `);
          
          // Create indexes
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vendor_transactions_vendor_id 
            ON vendor_transactions(vendor_id);
          `);
            
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
          `);
              
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
          `);

          // Add is_online column to vendors table
          await client.query(`
            ALTER TABLE vendors 
            ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false
          `);
          
          console.log('✅ Added is_online column to vendors table');
          
          // Create index for faster queries
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vendors_online 
            ON vendors(is_online);
          `);
          
    console.log('✅ Created index on is_online column');

    console.log('Tables created successfully!');

    console.log('✅ Vendor wallet and payment tables created!');

    console.log('Adding email verification columns...');
    
    // Add email_verified column
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS verification_token VARCHAR(100),
      ADD COLUMN IF NOT EXISTS token_created_at TIMESTAMP DEFAULT NOW();
    `);
    
    console.log('✅ Email verification columns added');
    
    // Create index for faster token lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_token 
      ON users(verification_token);
    `);
    
    console.log('✅ Verification token index created');

    // Check if vendors already exist
    const vendorCheck = await client.query('SELECT COUNT(*) FROM vendors');
    const vendorCount = parseInt(vendorCheck.rows[0].count);

    if (vendorCount === 0) {
      // Insert sample vendors
      await client.query(`
        INSERT INTO vendors (outlet_name) VALUES 
        ('Cafe 2004'),
        ('Brio'),
        ('Nescafe'),
        ('CHE Canteen'),
        ('Samocha'),
        ('Urban Vada Pav');
      `);
      console.log('Sample vendors inserted!');
    } else {
      console.log(`Vendors already exist (${vendorCount} found). Skipping vendor insertion.`);
    }

    // Check if menu items already exist
    const menuCheck = await client.query('SELECT COUNT(*) FROM menu_items');
    const menuCount = parseInt(menuCheck.rows[0].count);

    if (menuCount === 0) {
      // Insert sample menu items (using INSERT ... ON CONFLICT to prevent duplicates)
      await client.query(`
        INSERT INTO menu_items (vendor_id, name, price, category, description) VALUES
        (1, 'Masala Dosa', 70.00, 'South Indian', 'Crispy dosa filled with spiced potato'),
        (1, 'Veg Biryani', 90.00, 'Rice', 'Aromatic basmati rice with vegetables'),
        (1, 'Shahi Paneer', 160.00, 'Main Course', 'Rich creamy cottage cheese curry'),
        (1, 'Tava Roti', 7.00, 'Bread', 'Fresh wheat flatbread'),
        (1, 'Aloo Paratha', 60.00, 'Breakfast', 'Stuffed potato flatbread'),
        (1, 'Chole Bhature', 70.00, 'North Indian', 'Spicy chickpeas with fried bread'),
        (1, 'Pav Bhaji', 70.00, 'Street Food', 'Spiced mashed vegetables with bread'),
        (2, 'Peri-Peri Fries', 90.00, 'Snacks', 'Spicy Portuguese-style fries'),
        (2, 'Vada Pav', 45.00, 'Mumbai Street Food', 'Spiced potato fritter in bun'),
        (2, 'Cheese Sandwich', 50.00, 'Snacks', 'Grilled cheese sandwich'),
        (2, 'Cold Coffee', 60.00, 'Beverages', 'Chilled coffee with ice cream'),
        (3, 'Coffee', 25.00, 'Beverages', 'Hot brewed coffee'),
        (3, 'Tea', 15.00, 'Beverages', 'Fresh chai tea'),
        (3, 'Cappuccino', 50.00, 'Beverages', 'Espresso with steamed milk'),
        (3, 'Hot Chocolate', 45.00, 'Beverages', 'Rich chocolate drink'),
        (4, 'Honey Chilli Potato', 70.00, 'Chinese', 'Crispy potato in sweet chili sauce'),
        (4, 'Manchurian', 70.00, 'Chinese', 'Vegetable balls in tangy sauce'),
        (4, 'Fried Rice', 80.00, 'Chinese', 'Stir-fried rice with vegetables'),
        (4, 'Spring Roll', 60.00, 'Chinese', 'Crispy vegetable rolls'),
        (5, 'Samosa', 20.00, 'Snacks', 'Crispy fried pastry with potato'),
        (5, 'Kachori', 25.00, 'Snacks', 'Spicy lentil filled pastry'),
        (5, 'Pakora', 30.00, 'Snacks', 'Mixed vegetable fritters'),
        (6, 'Chotu Vada Pav', 30.00, 'Street Food', 'Mini potato vada in pav'),
        (6, 'Jumbo Vada Pav', 50.00, 'Street Food', 'Large vada pav with extra chutney'),
        (6, 'Cheese Vada Pav', 60.00, 'Street Food', 'Vada pav with melted cheese')
        ON CONFLICT (vendor_id, name, price) DO NOTHING;
      `);
      console.log('Sample menu items inserted!');
    } else {
      console.log(`Menu items already exist (${menuCount} found). Skipping menu insertion.`);
    }

    // Create a test user
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('test123', 10);
    
    await client.query(`
      INSERT INTO users (name, email, password, wallet_balance) VALUES 
      ('Test User', 'test@example.com', $1, 500.00)
      ON CONFLICT (email) DO NOTHING;
    `, [hashedPassword]);

    console.log('Test user created! Email: test@example.com, Password: test123');
    console.log('Database setup completed successfully!');

  } catch (err) {
    console.error('Database setup failed:', err);
  } finally {
    client.release();
    console.log('Setup complete. You can now run the server.');
    process.exit(0);
  }
}

setupDatabase();