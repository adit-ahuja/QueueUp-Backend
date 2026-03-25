const Razorpay = require('razorpay');
const { pool } = require('../config/database');

const getRazorpay = () => new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Calculate total earnings for a stall owner after an event
const calculateEarnings = async (stall_owner_id, event_id) => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(total_amount), 0) as total
     FROM orders 
     WHERE stall_id IN (
       SELECT id FROM stalls 
       WHERE owner_id = $1 AND event_id = $2
     ) AND status = 'collected'`,
    [stall_owner_id, event_id]
  );
  return parseFloat(result.rows[0].total);
};

// Create a payout record in DB
const createPayoutRecord = async (stall_owner_id, event_id, amount) => {
  const platform_fee = amount * 0.025;
  const net_amount = amount - platform_fee;

  const payout = await pool.query(
    `INSERT INTO payouts 
     (stall_owner_id, event_id, amount, platform_fee, net_amount, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [stall_owner_id, event_id, amount, platform_fee, net_amount]
  );
  return payout.rows[0];
};

// Process payout via Razorpay
const processPayout = async (payoutId, net_amount) => {
  try {
    const razorpay = getRazorpay();
    const transfer = await razorpay.transfers.create({
      account: 'acc_test',
      amount: Math.round(net_amount * 100),
      currency: 'INR',
      notes: { payout_id: payoutId }
    });

    await pool.query(
      `UPDATE payouts SET 
       razorpay_payout_id = $1, 
       status = 'paid' 
       WHERE id = $2`,
      [transfer.id, payoutId]
    );

    return transfer;
  } catch (err) {
    await pool.query(
      `UPDATE payouts SET status = 'failed' WHERE id = $1`,
      [payoutId]
    );
    throw err;
  }
};

module.exports = { calculateEarnings, createPayoutRecord, processPayout };