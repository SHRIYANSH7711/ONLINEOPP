// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const pool = require('./db');
const { verifyToken, requireRole } = require('./middleware/auth');
const Razorpay = require('razorpay');
const crypto = require('crypto');


const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendVerificationEmail(to, name, verificationToken) {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email.html?token=${verificationToken}`;
  
  const msg = {
    to: to,
    from: process.env.EMAIL_USER, 
    subject: 'Verify Your Onlineपेटपूजा Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #0e6253; text-align: center;">Welcome to Onlineपेटपूजा!</h2>
          <p>Hi <strong>${name}</strong>,</p>
          <p>Thank you for creating an account. Please verify your email address to get started.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background: #0e6253; color: white; padding: 15px 40px; 
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: bold; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #666; font-size: 14px; border-top: 1px solid #eee; padding-top: 20px;">
            If the button doesn't work, copy and paste this link:<br>
            <a href="${verificationUrl}" style="color: #0e6253; word-break: break-all;">${verificationUrl}</a>
          </p>
        </div>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log('✅ Verification email sent via SendGrid to:', to);
    return true;
  } catch (error) {
    console.error('❌ SendGrid error:', error.response ? error.response.body : error.message);
    throw error;
  }
}

// ==================== ENHANCED PASSWORD VALIDATION ====================
function validatePasswordStrength(password) {
  if (password.length < 10) {
    return { valid: false, message: 'Password must be at least 10 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true };
}

const app = express();
const port = process.env.PORT || 3001;

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ==================== MIDDLEWARE ====================

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
const rateLimitWindow = 15 * 60 * 1000;
const maxAttempts = 5;

function checkRateLimit(identifier) {
  const now = Date.now();
  const attempts = loginAttempts.get(identifier) || [];
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
  const { name, email, password, role, outletId } = req.body; // ← Add outletId
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const sanitizedName = sanitizeInput(name);
  const sanitizedEmail = sanitizeInput(email.toLowerCase());
  
  if (!validateEmail(sanitizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Enhanced password validation
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.message });
  }

  const validRoles = ['customer', 'vendor', 'student'];
  const userRole = role && validRoles.includes(role) ? role : 'customer';

  // Validate vendor outlet selection
  if (userRole === 'vendor') {
    if (!outletId) {
      return res.status(400).json({ error: 'Please select an outlet' });
    }
    
    const validOutletIds = [1, 2, 3, 4, 5, 6]; // Your outlet IDs
    if (!validOutletIds.includes(parseInt(outletId))) {
      return res.status(400).json({ error: 'Invalid outlet selected' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for existing user
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1', 
      [sanitizedEmail]
    );
    
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Create user
    const userResult = await client.query(
      `INSERT INTO users (name, email, password, role, email_verified, verification_token) 
       VALUES ($1, $2, $3, $4, false, $5) 
       RETURNING id, name, email, role, email_verified`,
      [sanitizedName, sanitizedEmail, hashedPassword, userRole, verificationToken]
    );

    const user = userResult.rows[0];

    // If vendor, link to outlet
    if (userRole === 'vendor') {
      // Check if user already manages this outlet
      const existingLink = await client.query(
        'SELECT id FROM vendor_users WHERE vendor_id = $1 AND user_id = $2',
        [outletId, user.id]
      );
      
      if (existingLink.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'You are already registered as a manager for this outlet.' 
        });
      }
      
      // Link user to vendor outlet (MULTIPLE MANAGERS ALLOWED)
      await client.query(
        'INSERT INTO vendor_users (vendor_id, user_id, role) VALUES ($1, $2, $3)',
        [outletId, user.id, 'manager']
      );
      
      // Get outlet name for response
      const outletResult = await client.query(
        'SELECT outlet_name FROM vendors WHERE id = $1',
        [outletId]
      );
      
      user.outlet_name = outletResult.rows[0].outlet_name;
      user.outlet_id = outletId;
    }

    await client.query('COMMIT');

    // Send verification email    
    try {
      await sendVerificationEmail(sanitizedEmail, sanitizedName, verificationToken);
      console.log('✅ Verification email sent to:', sanitizedEmail);
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError);
      // Continue anyway - user can request resend later
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        email_verified: user.email_verified,
        outlet_id: user.outlet_id // Include outlet in JWT
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ 
      message: userRole === 'vendor' 
        ? `Vendor account created for ${user.outlet_name}! Please check your email to verify.`
        : 'Account created! Please check your email to verify.', 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        email_verified: user.email_verified,
        outlet_id: user.outlet_id,
        outlet_name: user.outlet_name
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  } finally {
    client.release();
  }
});

app.get('/api/available-outlets', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, outlet_name
      FROM vendors
      WHERE is_active = true
      ORDER BY outlet_name
    `);
    
    // All outlets are always available (multiple managers allowed)
    const outlets = result.rows.map(outlet => ({
      id: outlet.id,
      name: outlet.outlet_name,
      available: true // Always true now
    }));
    
    res.json(outlets);
  } catch (error) {
    console.error('Error fetching outlets:', error);
    res.status(500).json({ error: 'Failed to fetch outlets' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const sanitizedEmail = sanitizeInput(email.toLowerCase());

  if (!checkRateLimit(sanitizedEmail)) {
    return res.status(429).json({ 
      error: 'Too many login attempts. Please try again in 15 minutes.' 
    });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password, role, wallet_balance, email_verified FROM users WHERE email = $1',
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

    loginAttempts.delete(sanitizedEmail);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, email_verified: user.email_verified },
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
        wallet_balance: user.wallet_balance,
        email_verified: user.email_verified
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify email endpoint
app.get('/api/verify-email/:token', async (req, res) => {
  const { token } = req.params;
  
  try {
    const result = await pool.query(
      `UPDATE users 
       SET email_verified = true, verification_token = NULL 
       WHERE verification_token = $1 AND email_verified = false
       RETURNING id, name, email, role, email_verified`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid or expired verification link' 
      });
    }
    
    const user = result.rows[0];
    
    res.json({ 
      success: true, 
      message: 'Email verified successfully!',
      user: user
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Resend verification email
app.post('/api/resend-verification', verifyToken, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, email_verified FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = user.rows[0];
    
    if (userData.email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    await pool.query(
      'UPDATE users SET verification_token = $1 WHERE id = $2',
      [verificationToken, req.user.id]
    );
    
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email.html?token=${verificationToken}`;
    
    try {
      await sendVerificationEmail(userData.email, userData.name, verificationToken);
      res.json({ success: true, message: 'Verification email sent!' });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ error: 'Failed to resend verification email' });
    }
    
    res.json({ success: true, message: 'Verification email sent!' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

app.patch('/api/profile', verifyToken, async (req, res) => {
  const { name, email } = req.body;
  
  try {
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(sanitizeInput(name));
      paramCount++;
    }

    if (email !== undefined) {
      const sanitizedEmail = sanitizeInput(email.toLowerCase());
      if (!validateEmail(sanitizedEmail)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      
      // Check if email already exists
      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [sanitizedEmail, req.user.id]
      );
      
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      
      updates.push(`email = $${paramCount}`);
      values.push(sanitizedEmail);
      paramCount++;
      
      // Reset email verification if email changed
      updates.push(`email_verified = false`);
      
      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      updates.push(`verification_token = $${paramCount}`);
      values.push(verificationToken);
      paramCount++;
      
      // Send verification email to new address
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email.html?token=${verificationToken}`;
      
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: sanitizedEmail,
          subject: 'Verify Your New Email Address',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0e6253;">Verify Your New Email</h2>
              <p>You've updated your email address. Please verify your new email:</p>
              <div style="margin: 30px 0; text-align: center;">
                <a href="${verificationUrl}" 
                   style="background: #0e6253; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 8px; display: inline-block;">
                  Verify Email Address
                </a>
              </div>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user.id);

    const result = await pool.query(`
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, email, role, email_verified, wallet_balance
    `, values);

    res.json({
      success: true,
      message: email !== undefined ? 
        'Profile updated! Please verify your new email address.' : 
        'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password (requires current password)
app.post('/api/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  
  // Validate new password strength
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.message });
  }
  
  try {
    const result = await pool.query(
      'SELECT password FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    const isValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, req.user.id]
    );
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
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
      `SELECT v.id, v.outlet_name 
      FROM vendors v
      JOIN vendor_users vu ON vu.vendor_id = v.id
      WHERE vu.user_id = $1`, 
      [req.user.id]
    );
    
    if (vendorRes.rows.length === 0) {
      return res.json([]);
    }
    
    const vendorId = vendorRes.rows[0].id;

    const result = await pool.query(
      'SELECT id, name, price, is_available, category, image_url FROM menu_items WHERE vendor_id = $1 ORDER BY name',
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
    const vendorRes = await pool.query(
      `SELECT v.id, v.outlet_name 
      FROM vendors v
      JOIN vendor_users vu ON vu.vendor_id = v.id
      WHERE vu.user_id = $1`, 
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

app.post('/api/menu', verifyToken, requireRole('vendor'), async (req, res) => {
  const { name, price, description, category, image_url } = req.body;
  
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
    const vendorRes = await pool.query(
      `SELECT v.id, v.outlet_name 
      FROM vendors v
      JOIN vendor_users vu ON vu.vendor_id = v.id
      WHERE vu.user_id = $1`, 
      [req.user.id]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    const vendorId = vendorRes.rows[0].id;

    const existingItem = await pool.query(
      'SELECT id FROM menu_items WHERE vendor_id = $1 AND name = $2 AND price = $3',
      [vendorId, sanitizedName, parseFloat(price)]
    );

    if (existingItem.rows.length > 0) {
      return res.status(400).json({ 
        error: 'An item with this name and price already exists in your menu' 
      });
    }

    const result = await pool.query(`
      INSERT INTO menu_items (vendor_id, name, price, description, category, image_url, is_available)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
    `, [vendorId, sanitizedName, parseFloat(price), sanitizedDescription, sanitizedCategory, image_url]);

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

app.patch('/api/menu/:id', verifyToken, requireRole('vendor'), async (req, res) => {
  const { name, price, description, category, image_url } = req.body;
  const itemId = req.params.id;

  if (price && price <= 0) {
    return res.status(400).json({ error: 'Price must be greater than 0' });
  }

  try {
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1',
      [req.user.id]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    const vendorId = vendorRes.rows[0].id;

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

    if (image_url !== undefined) {
      updates.push(`image_url = $${paramCount}`);
      values.push(image_url ? image_url.trim() : null);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

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

app.delete('/api/menu/:id', verifyToken, requireRole('vendor'), async (req, res) => {
  const itemId = req.params.id;

  try {
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1', 
      [req.user.id]
    );
    
    if (vendorRes.rows.length === 0) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    const vendorId = vendorRes.rows[0].id;

    const orderCheck = await pool.query(
      'SELECT COUNT(*) FROM order_items WHERE menu_item_id = $1',
      [itemId]
    );

    const orderCount = parseInt(orderCheck.rows[0].count);

    if (orderCount > 0) {
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

// ==================== REAL UPI PAYMENT INTEGRATION ====================

app.post('/api/payment/create-order', verifyToken, async (req, res) => {
  const { amount, vendor_name, vendor_upi_id, items } = req.body;
  
  try {
    const options = {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        vendor_name: vendor_name,
        vendor_upi: vendor_upi_id,
        user_id: req.user.id,
        items: JSON.stringify(items)
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.json({
      success: true,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create payment order' 
    });
  }
});

app.post('/api/payment/verify', verifyToken, async (req, res) => {
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature,
    vendor_name,
    vendor_id,
    items,
    amount 
  } = req.body;

  const client = await pool.connect();
  
  try {
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid payment signature' 
      });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return res.status(400).json({ 
        success: false, 
        error: 'Payment not successful' 
      });
    }

    await client.query('BEGIN');

    const today = new Date();
    const dateKey = today.toISOString().split('T')[0];
    
    const counterResult = await client.query(`
      INSERT INTO vendor_order_counters (vendor_id, order_date, counter) 
      VALUES ($1, $2, 1)
      ON CONFLICT (vendor_id, order_date) 
      DO UPDATE SET counter = vendor_order_counters.counter + 1
      RETURNING counter
    `, [vendor_id, dateKey]);
    
    const orderOfDay = counterResult.rows[0].counter;
    const [year, month, day] = dateKey.split('-');
    const token = `${day}_${month}_${year}_${String(orderOfDay).padStart(3, '0')}`;

    const orderResult = await client.query(`
      INSERT INTO orders (
        user_id, 
        token, 
        total_amount, 
        order_date, 
        order_of_day,
        payment_method,
        upi_id,
        transaction_id,
        payment_status,
        razorpay_order_id,
        razorpay_payment_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING id
    `, [
      req.user.id, 
      token, 
      amount / 100, 
      dateKey, 
      orderOfDay,
      'UPI',
      payment.vpa || 'UPI Payment',
      razorpay_payment_id,
      'completed',
      razorpay_order_id,
      razorpay_payment_id
    ]);
    
    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      await client.query(`
        INSERT INTO order_items (order_id, menu_item_id, qty, price, vendor_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, item.menu_item_id, item.qty, item.price, vendor_id]);
    }

    await client.query(`
      UPDATE vendors 
      SET wallet_balance = wallet_balance + $1 
      WHERE id = $2
    `, [amount / 100, vendor_id]);

    await client.query(`
      INSERT INTO vendor_transactions (
        vendor_id, 
        amount, 
        type, 
        description, 
        reference_id,
        payment_id
      )
      VALUES ($1, $2, 'credit', $3, $4, $5)
    `, [
      vendor_id,
      amount / 100,
      `Order payment - Token: ${token}`,
      token,
      razorpay_payment_id
    ]);

    await client.query(`
      INSERT INTO transactions (
        user_id, 
        amount, 
        type, 
        description, 
        reference_id,
        payment_method,
        transaction_id
      )
      VALUES ($1, $2, 'debit', $3, $4, $5, $6)
    `, [
      req.user.id, 
      amount / 100, 
      `Order payment - ${vendor_name}`, 
      token,
      'UPI',
      razorpay_payment_id
    ]);

    await client.query(`
      INSERT INTO notifications (user_id, title, message, type, reference_id, is_read)
      VALUES ($1, $2, $3, $4, $5, false)
    `, [
      req.user.id, 
      'Payment Successful', 
      `Your payment of ₹${(amount / 100).toFixed(2)} was successful. Order Token: ${token}`,
      'payment',
      token
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      order_id: orderId,
      token: token,
      payment_id: razorpay_payment_id,
      amount: amount / 100
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Payment verification failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Payment verification failed' 
    });
  } finally {
    client.release();
  }
});

app.get('/api/vendor/:vendorId/upi', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT upi_id, outlet_name FROM vendors WHERE id = $1',
      [req.params.vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({
      upi_id: result.rows[0].upi_id,
      outlet_name: result.rows[0].outlet_name
    });

  } catch (error) {
    console.error('Vendor UPI fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor UPI' });
  }
});

// ==================== VENDOR WALLET & UPI MANAGEMENT ====================

app.get('/api/vendor/wallet', verifyToken, requireRole('vendor'), async (req, res) => {
  try {
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1', 
      [req.user.id]
    );
    
    if (vendorRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    const vendorId = vendorRes.rows[0].id;

    const walletRes = await pool.query(
      'SELECT wallet_balance, upi_id FROM vendors WHERE id = $1',
      [vendorId]
    );

    const transactionsRes = await pool.query(`
      SELECT amount, type, description, created_at, payment_id
      FROM vendor_transactions 
      WHERE vendor_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50
    `, [vendorId]);

    res.json({
      balance: walletRes.rows[0].wallet_balance || 0,
      upi_id: walletRes.rows[0].upi_id,
      transactions: transactionsRes.rows
    });

  } catch (error) {
    console.error('Vendor wallet fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet info' });
  }
});

app.post('/api/vendor/upi', verifyToken, requireRole('vendor'), async (req, res) => {
  const { upi_id } = req.body;

  const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
  if (!upiRegex.test(upi_id)) {
    return res.status(400).json({ error: 'Invalid UPI ID format' });
  }

  try {
    const vendorRes = await pool.query(
      'SELECT id FROM vendors WHERE owner_user_id = $1', 
      [req.user.id]
    );
    
    if (vendorRes.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    const vendorId = vendorRes.rows[0].id;

    await pool.query(
      'UPDATE vendors SET upi_id = $1 WHERE id = $2',
      [upi_id, vendorId]
    );

    res.json({ 
      success: true, 
      message: 'UPI ID updated successfully',
      upi_id: upi_id 
    });

  } catch (error) {
    console.error('UPI update error:', error);
    res.status(500).json({ error: 'Failed to update UPI ID' });
  }
});

// ==================== ORDER ROUTES ====================

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

    const orderResult = await client.query(
      'SELECT user_id, token FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const userId = order.user_id;
    const token = order.token;

    const updateResult = await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, orderId]
    );

    const notificationMessages = {
      'confirmed': `Your order ${token} has been confirmed and is being prepared.`,
      'preparing': `Your order ${token} is now being prepared by the vendor.`,
      'ready': `Great news! Your order ${token} is ready for pickup. Please collect it from the counter.`,
      'completed': `Your order ${token} has been completed. Thank you for ordering with us!`
    };

    const notificationMessage = notificationMessages[status] || `Your order ${token} status has been updated to ${status}.`;

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

// ==================== NOTIFICATION ROUTES ====================

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