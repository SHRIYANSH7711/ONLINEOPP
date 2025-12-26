// backend/test-email.js
require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('=== EMAIL CONFIGURATION TEST ===');
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '✓ Set (length: ' + process.env.EMAIL_PASSWORD.length + ')' : '✗ Not set');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Verify connection
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Connection failed:', error.message);
  } else {
    console.log('✅ SMTP connection successful!');
    
    // Send test email
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send to yourself
      subject: 'Test Email - Onlineपेटपूजा',
      html: '<h1>✅ Email Configuration Works!</h1><p>Your email system is properly configured.</p>'
    }, (err, info) => {
      if (err) {
        console.error('❌ Email send failed:', err.message);
      } else {
        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('Check your inbox:', process.env.EMAIL_USER);
      }
    });
  }
});