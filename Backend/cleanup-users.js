// Backend/cleanup-users.js
// ⚠️ WARNING: This will DELETE ALL user data!

require('dotenv').config();
const pool = require('./db');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askConfirmation(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function cleanupDatabase() {
  console.log('⚠️  DATABASE CLEANUP UTILITY');
  console.log('━'.repeat(50));
  console.log('This will DELETE ALL:');
  console.log('  • User accounts');
  console.log('  • Orders and order history');
  console.log('  • Transactions');
  console.log('  • Notifications');
  console.log('  • Vendor-user associations');
  console.log('  • Wallet balances');
  console.log('\n⚠️  OUTLETS AND MENU ITEMS WILL BE PRESERVED');
  console.log('━'.repeat(50) + '\n');

  const confirm1 = await askConfirmation('Are you ABSOLUTELY SURE? Type "yes" to continue: ');
  
  if (!confirm1) {
    console.log('❌ Cleanup cancelled.');
    rl.close();
    process.exit(0);
  }

  const confirm2 = await askConfirmation('\n⚠️  FINAL WARNING! This cannot be undone. Type "yes" again: ');
  
  if (!confirm2) {
    console.log('❌ Cleanup cancelled.');
    rl.close();
    process.exit(0);
  }

  rl.close();

  const client = await pool.connect();
  
  try {
    console.log('\n🔄 Starting cleanup...\n');
    
    await client.query('BEGIN');

    // 1. Delete vendor-user associations
    const vendorUsersResult = await client.query('DELETE FROM vendor_users RETURNING *');
    console.log(`✅ Deleted ${vendorUsersResult.rowCount} vendor-user associations`);

    // 2. Delete notifications
    const notificationsResult = await client.query('DELETE FROM notifications RETURNING *');
    console.log(`✅ Deleted ${notificationsResult.rowCount} notifications`);

    // 3. Delete transactions
    const transactionsResult = await client.query('DELETE FROM transactions RETURNING *');
    console.log(`✅ Deleted ${transactionsResult.rowCount} user transactions`);

    // 4. Delete vendor transactions
    const vendorTransResult = await client.query('DELETE FROM vendor_transactions RETURNING *');
    console.log(`✅ Deleted ${vendorTransResult.rowCount} vendor transactions`);

    // 5. Delete order items
    const orderItemsResult = await client.query('DELETE FROM order_items RETURNING *');
    console.log(`✅ Deleted ${orderItemsResult.rowCount} order items`);

    // 6. Delete orders
    const ordersResult = await client.query('DELETE FROM orders RETURNING *');
    console.log(`✅ Deleted ${ordersResult.rowCount} orders`);

    // 7. Reset order counters
    await client.query('DELETE FROM vendor_order_counters');
    console.log('✅ Reset order counters');

    // 8. Reset vendor wallets (but keep vendors)
    await client.query('UPDATE vendors SET wallet_balance = 0.00, owner_user_id = NULL');
    console.log('✅ Reset vendor wallets to 0');

    // 9. Delete all users (THIS IS THE BIG ONE)
    const usersResult = await client.query('DELETE FROM users RETURNING email, role');
    console.log(`✅ Deleted ${usersResult.rowCount} user accounts:`);
    
    // Show deleted users
    const usersByRole = usersResult.rows.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});
    
    console.log('   Breakdown:');
    Object.entries(usersByRole).forEach(([role, count]) => {
      console.log(`   • ${role}: ${count}`);
    });

    await client.query('COMMIT');
    
    console.log('\n✅ DATABASE CLEANUP COMPLETE!');
    console.log('━'.repeat(50));
    console.log('📊 Summary:');
    console.log(`   • ${usersResult.rowCount} users deleted`);
    console.log(`   • ${ordersResult.rowCount} orders deleted`);
    console.log(`   • ${transactionsResult.rowCount} transactions deleted`);
    console.log(`   • Outlets and menu items preserved`);
    console.log('\n✨ Your system is now fresh and ready for new users!\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupDatabase()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });