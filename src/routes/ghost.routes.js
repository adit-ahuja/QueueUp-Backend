const express = require('express');
const router  = express.Router();
const { getServerTime, getPattern } = require('../controllers/ghost.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// GET /api/ghost/time — public, no auth needed (clock sync before login)
router.get('/time', getServerTime);

// GET /api/ghost/pattern/:orderId — auth required (customer or stall owner only)
router.get('/pattern/:orderId', authenticate, getPattern);

module.exports = router;
