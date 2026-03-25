// TODO (Week 2): Implement auth controller — sendOtp, verifyOtp
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { redisClient } = require('../config/redis');
const { success, error } = require('../utils/response');
const { notifyNLP } = require('../utils/notifyNLP');

// Generate a 6 digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// POST /api/auth/send-otp
const sendOTP = async (req, res) => {
 const { phone, name, role, fcm_token } = req.body;

  if (!phone) return error(res, 'Phone number is required');

  try {
    const otp = generateOTP();

    // Store OTP in Redis with 5 minute expiry
    await redisClient.setEx(`otp:${phone}`, 300, otp);

    // In development, print OTP in terminal
    console.log(`📱 OTP for ${phone}: ${otp}`);

if (fcm_token) {
  await notifyNLP('OTP_REQUESTED', {
    recipient_fcm_token: fcm_token,
    phone: phone,
    otp_code: otp,
  });
}

    return success(res, { phone }, 'OTP sent successfully');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to send OTP', 500);
  }
};

// POST /api/auth/verify-otp
const verifyOTP = async (req, res) => {
  const { phone, otp, name, role } = req.body;

  if (!phone || !otp) return error(res, 'Phone and OTP are required');

  try {
    // Get OTP from Redis
    const storedOTP = await redisClient.get(`otp:${phone}`);

    if (!storedOTP) return error(res, 'OTP expired. Please request a new one', 400);
    if (storedOTP !== otp) return error(res, 'Invalid OTP', 400);

    // Delete OTP from Redis after successful verification
    await redisClient.del(`otp:${phone}`);

    // Check if user exists, if not create them
    let user = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);

    if (user.rows.length === 0) {
      // New user — create account
      user = await pool.query(
        'INSERT INTO users (name, phone, role) VALUES ($1, $2, $3) RETURNING *',
        [name || 'QueueUp User', phone, role || 'customer']
      );
    }

    const userData = user.rows[0];

    // FIX: for stall_owner role, join stalls table to return stall_id + stall_name
    // Three screens (StallDashboardScreen, StallOrderDetailScreen, StallMenuMgmtScreen)
    // depend on stall_id being present on the auth user object immediately after login.
    let responseUser = { ...userData };
    if (userData.role === 'stall_owner') {
      const stallResult = await pool.query(
        'SELECT id AS stall_id, name AS stall_name FROM stalls WHERE owner_id = $1 AND is_active = true LIMIT 1',
        [userData.id]
      );
      if (stallResult.rows.length > 0) {
        responseUser.stall_id   = stallResult.rows[0].stall_id;
        responseUser.stall_name = stallResult.rows[0].stall_name;
      }
      // stall_owner exists but hasn't created a stall yet — stall_id will be null,
      // front-end should redirect to stall creation flow in that case.
    }

    // Generate JWT token — include stall_id in payload for middleware access
    const token = jwt.sign(
      {
        id: userData.id,
        phone: userData.phone,
        role: userData.role,
        stall_id: responseUser.stall_id || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return success(res, { token, user: responseUser }, 'Login successful');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to verify OTP', 500);
  }
};

module.exports = { sendOTP, verifyOTP };