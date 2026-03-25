// TODO (Week 2): Implement user controller — getUser, updateUser
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

// GET /api/users/:id
const getUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await pool.query(
      'SELECT id, name, phone, email, role, trust_score, is_active, created_at FROM users WHERE id = $1',
      [id]
    );
    if (user.rows.length === 0) return error(res, 'User not found', 404);
    return success(res, user.rows[0]);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get user', 500);
  }
};

// PATCH /api/users/:id
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  try {
    const user = await pool.query(
      'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, email, id]
    );
    if (user.rows.length === 0) return error(res, 'User not found', 404);
    return success(res, user.rows[0], 'User updated successfully');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to update user', 500);
  }
};

// PATCH /api/users/fcm-token — save FCM token
const saveFCMToken = async (req, res) => {
  const { fcm_token } = req.body;
  const id = req.user.id;

  if (!fcm_token) return error(res, 'FCM token is required');

  try {
    const user = await pool.query(
      `UPDATE users SET fcm_token = $1, 
       updated_at = NOW() 
       WHERE id = $2 RETURNING *`,
      [fcm_token, id]
    );
    if (user.rows.length === 0) return error(res, 'User not found', 404);
    return success(res, user.rows[0], 'FCM token saved successfully');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to save FCM token', 500);
  }
};

module.exports = { getUser, updateUser, saveFCMToken };