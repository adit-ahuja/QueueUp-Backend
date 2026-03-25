const express = require('express');
const router = express.Router();
const { getUser, updateUser, saveFCMToken } = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// GET /api/users/:id
router.get('/:id', authenticate, getUser);

// PATCH /api/users/:id
router.patch('/:id', authenticate, updateUser);

// PATCH /api/users/fcm-token — save FCM token
router.patch('/fcm-token', authenticate, saveFCMToken);

module.exports = router;