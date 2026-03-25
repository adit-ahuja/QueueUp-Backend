const express = require('express');
const router = express.Router();
const { sendOTP, verifyOTP } = require('../controllers/auth.controller');

// POST /api/auth/send-otp
router.post('/send-otp', sendOTP);

// POST /api/auth/verify-otp
router.post('/verify-otp', verifyOTP);

module.exports = router;