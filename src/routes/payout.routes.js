const express = require('express');
const router = express.Router();
const { initiatePayout, getPayouts } = require('../controllers/payout.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// POST /api/payouts — initiate payout (stall owners only)
router.post('/', authenticate, authorize('stall_owner', 'organiser'), initiatePayout);

// GET /api/payouts — get my payouts
router.get('/', authenticate, getPayouts);

module.exports = router;