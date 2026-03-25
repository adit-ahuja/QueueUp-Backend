const { calculateEarnings, createPayoutRecord, processPayout } = require('../services/payout.service');
const { success, error } = require('../utils/response');
const { pool } = require('../config/database');

// POST /api/payouts — initiate payout for stall owner
const initiatePayout = async (req, res) => {
  const { event_id } = req.body;
  const stall_owner_id = req.user.id;

  if (!event_id) return error(res, 'Event ID is required');

  try {
    // Calculate total earnings
    const amount = await calculateEarnings(stall_owner_id, event_id);

    if (amount === 0)
      return error(res, 'No earnings found for this event');

    // Create payout record
    const payout = await createPayoutRecord(stall_owner_id, event_id, amount);

    // Process via Razorpay
    await processPayout(payout.id, payout.net_amount);

    return success(res, payout, 'Payout initiated successfully');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to initiate payout', 500);
  }
};

// GET /api/payouts — get all payouts for stall owner
const getPayouts = async (req, res) => {
  const stall_owner_id = req.user.id;
  try {
    const payouts = await pool.query(
      `SELECT * FROM payouts 
       WHERE stall_owner_id = $1 
       ORDER BY created_at DESC`,
      [stall_owner_id]
    );
    return success(res, payouts.rows);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get payouts', 500);
  }
};

module.exports = { initiatePayout, getPayouts };