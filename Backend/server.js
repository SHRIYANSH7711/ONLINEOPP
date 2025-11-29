// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const pool = require('./db');
const { verifyToken, requireRole } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3001;

// ==================== MIDDLEWARE ====================

// CORS Configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../Frontend')));

// Simple rate limiting (in-memory)
const loginAttempts = new Map();
const rateLimitWindow = 15 * 60 * 1000; // 15 minutes
const maxAttempts = 5;

function checkRateLimit(identifier) {
  const now = Date.now();
  const attempts = loginAttempts.get(identifier) || [];
  
  // Remove old attempts outside the window
  const recentAttempts = attempts.filter(time => now - time < rateLimitWindow);
  
  if (recentAttempts.length >= maxAttempts) {
    return false;
  }
  
  recentAttempts.push(now);
  loginAttempts.set(identifier, recentAttempts);
  return true;
}

// ==================== INPUT VALIDATION ====================

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  return password && password.length >= 6;
}

function sanitizeInput(str) {
  return str ? str.trim() : '';
}

// ==================== AUTH ROUTES ====================

app.post('/api/signup', async (req, res) => {
  const { name, email, password, role } = req.body;
  
  // Input validation
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const sanitizedName = sanitizeInput(name);
  const sanitizedEmail = sanitizeInput(email.toLowerCase());
  
  if (!validateEmail(sanitizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const validRoles = ['customer', 'vendor', 'student'];
  const userRole = role && validRoles.includes(role) ? role : 'customer';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1', 
      [sanitizedEmail]
    );
    
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await client.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [sanitizedName, sanitizedEmail, hashedPassword, userRole]
    );

    const user = result.rows[0];

    await client.query('COMMIT');

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ 
      message: 'User created successfully', 
      token, 
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  } finally {
    client.release();
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const sanitizedEmail = sanitizeInput(email.toLowerCase());

  // Rate limiting check
  if (!checkRateLimit(sanitizedEmail)) {
    return res.status(429).json({ 
      error: 'Too many login attempts. Please try again in 15 minutes.' 
    });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password, role, wallet_balance FROM users WHERE email = $1',
      [sanitizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Clear rate limit on successful login
    loginAttempts.delete(sanitizedEmail);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        wallet_balance: user.wallet_balance
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ==================== MENU ROUTES ====================

app.get('/api/menu', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.id, m.name, m.price, m.description, m.image_url, m.category, m.is_available, 
             v.outlet_name, v.id as vendor_id
      FROM menu_items m
      JOIN vendors v ON v.id = m.vendor_id
      WHERE m.is_available = true AND v.is_active = true
      ORDER BY v.outlet_name, m.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Menu fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

app.get('/api/menu/vendor', verifyToken, requireRole('vendor'), async (req, res) => {
  try {
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1', 
      [req.user.id]
    );
    
    if (vendorRes.rows.length === 0) {
      return res.json([]);
    }
    
    const vendorId = vendorRes.rows[0].id;

    const result = await pool.query(
      'SELECT id, name, price, is_available, category FROM menu_items WHERE vendor_id = $1 ORDER BY name',
      [vendorId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Vendor menu fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

app.patch('/api/menu/:id/availability', verifyToken, requireRole('vendor'), async (req, res) => {
  const { is_available } = req.body;
  const itemId = req.params.id;
  
  if (typeof is_available !== 'boolean') {
    return res.status(400).json({ error: 'is_available must be a boolean' });
  }

  try {
    // Verify the menu item belongs to this vendor
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1',
      [req.user.id]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    const vendorId = vendorRes.rows[0].id;

    const result = await pool.query(
      'UPDATE menu_items SET is_available = $1 WHERE id = $2 AND vendor_id = $3 RETURNING *',
      [is_available, itemId, vendorId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found or unauthorized' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Availability update error:', err);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// Add this to your server.js after the existing menu endpoints

// ==================== ADD/DELETE MENU ITEM ROUTES ====================

// Add new menu item (vendor only)
app.post('/api/menu', verifyToken, requireRole('vendor'), async (req, res) => {
  const { name, price, description, category } = req.body;
  
  // Validation
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  if (price <= 0) {
    return res.status(400).json({ error: 'Price must be greater than 0' });
  }

  const sanitizedName = name.trim();
  const sanitizedDescription = description ? description.trim() : null;
  const sanitizedCategory = category ? category.trim() : null;

  try {
    // Get vendor ID
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1',
      [req.user.id]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    const vendorId = vendorRes.rows[0].id;

    // Check if item already exists (same name and price for this vendor)
    const existingItem = await pool.query(
      'SELECT id FROM menu_items WHERE vendor_id = $1 AND name = $2 AND price = $3',
      [vendorId, sanitizedName, parseFloat(price)]
    );

    if (existingItem.rows.length > 0) {
      return res.status(400).json({ 
        error: 'An item with this name and price already exists in your menu' 
      });
    }

    // Insert new menu item
    const result = await pool.query(`
      INSERT INTO menu_items (vendor_id, name, price, description, category, is_available)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [vendorId, sanitizedName, parseFloat(price), sanitizedDescription, sanitizedCategory]);

    res.status(201).json({
      success: true,
      message: 'Menu item added successfully',
      item: result.rows[0]
    });

  } catch (err) {
    console.error('Add menu item error:', err);
    res.status(500).json({ error: 'Failed to add menu item' });
  }
});

// Update menu item (vendor only)
app.patch('/api/menu/:id', verifyToken, requireRole('vendor'), async (req, res) => {
  const { name, price, description, category } = req.body;
  const itemId = req.params.id;

  // Validation
  if (price && price <= 0) {
    return res.status(400).json({ error: 'Price must be greater than 0' });
  }

  try {
    // Get vendor ID
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1',
      [req.user.id]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    const vendorId = vendorRes.rows[0].id;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name.trim());
      paramCount++;
    }

    if (price !== undefined) {
      updates.push(`price = $${paramCount}`);
      values.push(parseFloat(price));
      paramCount++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description ? description.trim() : null);
      paramCount++;
    }

    if (category !== undefined) {
      updates.push(`category = $${paramCount}`);
      values.push(category ? category.trim() : null);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add item ID and vendor ID to values
    values.push(itemId, vendorId);

    const result = await pool.query(`
      UPDATE menu_items 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND vendor_id = $${paramCount + 1}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found or unauthorized' });
    }

    res.json({
      success: true,
      message: 'Menu item updated successfully',
      item: result.rows[0]
    });

  } catch (err) {
    console.error('Update menu item error:', err);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// Delete menu item (vendor only)
app.delete('/api/menu/:id', verifyToken, requireRole('vendor'), async (req, res) => {
  const itemId = req.params.id;

  try {
    // Get vendor ID
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1',
      [req.user.id]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    const vendorId = vendorRes.rows[0].id;

    // Check if item is used in any orders
    const orderCheck = await pool.query(
      'SELECT COUNT(*) FROM order_items WHERE menu_item_id = $1',
      [itemId]
    );

    const orderCount = parseInt(orderCheck.rows[0].count);

    if (orderCount > 0) {
      // Instead of deleting, just mark as unavailable
      await pool.query(
        'UPDATE menu_items SET is_available = false WHERE id = $1 AND vendor_id = $2',
        [itemId, vendorId]
      );
      
      return res.json({
        success: true,
        message: 'Item has been marked as unavailable (it cannot be deleted because it exists in past orders)',
        soft_delete: true
      });
    }

    // Delete the item
    const result = await pool.query(
      'DELETE FROM menu_items WHERE id = $1 AND vendor_id = $2 RETURNING *',
      [itemId, vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found or unauthorized' });
    }

    res.json({
      success: true,
      message: 'Menu item deleted successfully',
      soft_delete: false
    });

  } catch (err) {
    console.error('Delete menu item error:', err);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// ==================== ORDER ROUTES ====================

app.post('/api/orders', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items provided' });
  }

  // Validate items structure
  for (const item of items) {
    if (!item.menu_item_id || !item.qty || item.qty < 1) {
      return res.status(400).json({ error: 'Invalid item structure' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT wallet_balance FROM users WHERE id = $1', 
      [userId]
    );
    const userBalance = parseFloat(userResult.rows[0].wallet_balance);

    const menuIds = items.map(item => item.menu_item_id);
    const menuQuery = `
      SELECT id, name, price, vendor_id 
      FROM menu_items 
      WHERE id = ANY($1) AND is_available = true
    `;
    const menuResult = await client.query(menuQuery, [menuIds]);
    
    if (menuResult.rows.length !== menuIds.length) {
      throw new Error('Some items are not available');
    }

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const menuItem = menuResult.rows.find(m => m.id === item.menu_item_id);
      if (!menuItem) {
        throw new Error('Item not found');
      }
      
      const itemTotal = parseFloat(menuItem.price) * parseInt(item.qty);
      totalAmount += itemTotal;
      
      orderItems.push({
        menu_item_id: item.menu_item_id,
        qty: item.qty,
        price: menuItem.price,
        vendor_id: menuItem.vendor_id
      });
    }

    if (userBalance < totalAmount) {
      throw new Error('Insufficient wallet balance');
    }

    // Generate token
    const today = new Date();
    const dateKey = today.toISOString().split('T')[0];
    
    const counterResult = await client.query(`
      INSERT INTO order_counters (order_date, counter) VALUES ($1, 1)
      ON CONFLICT (order_date) DO UPDATE SET counter = order_counters.counter + 1
      RETURNING counter
    `, [dateKey]);
    
    const orderOfDay = counterResult.rows[0].counter;
    const [year, month, day] = dateKey.split('-');
    const token = `${day}_${month}_${year}_${String(orderOfDay).padStart(2, '0')}`;

    // Create order
    const orderResult = await client.query(`
      INSERT INTO orders (user_id, token, total_amount, order_date, order_of_day)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [userId, token, totalAmount, dateKey, orderOfDay]);
    
    const orderId = orderResult.rows[0].id;

    // Insert order items
    for (const item of orderItems) {
      await client.query(`
        INSERT INTO order_items (order_id, menu_item_id, qty, price, vendor_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, item.menu_item_id, item.qty, item.price, item.vendor_id]);
    }

    // Update wallet and create transaction
    await client.query(
      'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', 
      [totalAmount, userId]
    );
    
    await client.query(`
      INSERT INTO transactions (user_id, amount, type, description, reference_id)
      VALUES ($1, $2, 'debit', 'Order payment', $3)
    `, [userId, totalAmount, token]);

    await client.query('COMMIT');

    res.json({
      success: true,
      order_id: orderId,
      token: token,
      total: totalAmount
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order creation failed:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/orders', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.id, o.token, o.total_amount, o.status, o.created_at,
             json_agg(json_build_object(
               'name', m.name,
               'qty', oi.qty,
               'price', oi.price,
               'vendor', v.outlet_name
             )) as items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN menu_items m ON m.id = oi.menu_item_id
      LEFT JOIN vendors v ON v.id = oi.vendor_id
      WHERE o.user_id = $1
      GROUP BY o.id, o.token, o.total_amount, o.status, o.created_at
      ORDER BY o.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Orders fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/orders/vendor', verifyToken, requireRole('vendor'), async (req, res) => {
  try {
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1', 
      [req.user.id]
    );
    
    if (vendorRes.rows.length === 0) {
      return res.json([]);
    }
    
    const vendorId = vendorRes.rows[0].id;
    
    const result = await pool.query(`
  SELECT o.id, o.token, o.total_amount, o.status, o.created_at,
         json_agg(json_build_object(
           'name', m.name,
           'qty', oi.qty,
           'price', oi.price
         )) as items
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN menu_items m ON m.id = oi.menu_item_id
  WHERE oi.vendor_id = $1
  GROUP BY o.id, o.token, o.total_amount, o.status, o.created_at
  ORDER BY o.created_at DESC
`, [vendorId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Vendor orders fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch vendor orders' });
  }
});

// Add this to your existing server.js
// Find the PATCH /api/orders/:id/status endpoint (around line 460-480)
// and REPLACE it with this updated version:

app.patch('/api/orders/:id/status', verifyToken, requireRole('vendor'), async (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;
  
  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the order details including user_id and token
    const orderResult = await client.query(
      'SELECT user_id, token, status as old_status FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const userId = order.user_id;
    const token = order.token;
    const oldStatus = order.old_status;

    // Update order status
    const updateResult = await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, orderId]
    );

    // Create notification for the customer
    const notificationMessage = getStatusNotificationMessage(status, token);
    await client.query(`
      INSERT INTO notifications (user_id, title, message, type, reference_id, is_read)
      VALUES ($1, $2, $3, $4, $5, false)
    `, [userId, 'Order Status Updated', notificationMessage, 'order', token]);

    await client.query('COMMIT');
    
    res.json(updateResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order status update error:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  } finally {
    client.release();
  }
});

// Helper function to generate notification messages
function getStatusNotificationMessage(status, token) {
  const messages = {
    'confirmed': `Your order ${token} has been confirmed and is being prepared.`,
    'preparing': `Your order ${token} is now being prepared by the vendor.`,
    'ready': `Great news! Your order ${token} is ready for pickup. Please collect it from the counter.`,
    'completed': `Your order ${token} has been completed. Thank you for ordering with us!`
  };
  return messages[status] || `Your order ${token} status has been updated to ${status}.`;
}

// Add new endpoint to get user notifications
app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, message, type, reference_id, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Notifications fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Add endpoint to mark notification as read
app.patch('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Notification update error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Add endpoint to mark all notifications as read
app.patch('/api/notifications/mark-all-read', verifyToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Add endpoint to get unread notification count
app.get('/api/notifications/unread-count', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ==================== WALLET ROUTES ====================

app.get('/api/wallet', verifyToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT wallet_balance FROM users WHERE id = $1', 
      [req.user.id]
    );
    
    const transactionsResult = await pool.query(`
      SELECT amount, type, description, created_at 
      FROM transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `, [req.user.id]);

    res.json({
      balance: userResult.rows[0].wallet_balance,
      transactions: transactionsResult.rows
    });
  } catch (err) {
    console.error('Wallet fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch wallet info' });
  }
});

app.post('/api/wallet/add', verifyToken, async (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount <= 0 || amount > 10000) {
    return res.status(400).json({ error: 'Invalid amount (must be between 1-10000)' });
  }

  try {
    await pool.query(
      'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', 
      [amount, req.user.id]
    );
    
    await pool.query(`
      INSERT INTO transactions (user_id, amount, type, description)
      VALUES ($1, $2, 'credit', 'Wallet top-up')
    `, [req.user.id, amount]);

    const result = await pool.query(
      'SELECT wallet_balance FROM users WHERE id = $1', 
      [req.user.id]
    );
    
    res.json({ 
      success: true, 
      new_balance: result.rows[0].wallet_balance 
    });
  } catch (err) {
    console.error('Wallet add error:', err);
    res.status(500).json({ error: 'Failed to add money to wallet' });
  }
});

// ==================== TEST ROUTE ====================

app.get('/api/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected!', time: result.rows[0].now });
  } catch (err) {
    console.error('DB test error:', err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// ==================== SERVE FRONTEND (MUST BE LAST) ====================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// ==================== START SERVER ====================

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});