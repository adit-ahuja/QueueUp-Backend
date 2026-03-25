const Bull = require('bull');
const { calculateEarnings, createPayoutRecord, processPayout } = require('./payout.service');

// Create payout queue
const payoutQueue = new Bull('payout-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  }
});

// Process jobs in the queue
payoutQueue.process(async (job) => {
  const { stall_owner_id, event_id } = job.data;
  console.log(`⚙️ Processing payout for stall owner ${stall_owner_id}`);

  const amount = await calculateEarnings(stall_owner_id, event_id);
  if (amount === 0) {
    console.log(`⚠️ No earnings found for stall owner ${stall_owner_id}`);
    return;
  }

  const payout = await createPayoutRecord(stall_owner_id, event_id, amount);
  await processPayout(payout.id, payout.net_amount);
  console.log(`✅ Payout processed for stall owner ${stall_owner_id} — ₹${payout.net_amount}`);
});

// Schedule payouts for all stall owners after event ends
const scheduleEventPayouts = async (event_id, stall_owner_ids, delayMs = 7200000) => {
  console.log(`📅 Scheduling payouts for event ${event_id} in 2 hours...`);
  for (const stall_owner_id of stall_owner_ids) {
    await payoutQueue.add(
      { stall_owner_id, event_id },
      { delay: delayMs } // 2 hours after event ends
    );
  }
  console.log(`✅ ${stall_owner_ids.length} payouts scheduled!`);
};

payoutQueue.on('completed', (job) => {
  console.log(`✅ Payout job ${job.id} completed`);
});

payoutQueue.on('failed', (job, err) => {
  console.error(`❌ Payout job ${job.id} failed:`, err.message);
});

module.exports = { payoutQueue, scheduleEventPayouts };