const express = require('express');
const router = express.Router();
const { createStall, getStall, getStallMenu, addMenuItem, getEventStalls, updateMenuItem, deleteMenuItem } = require('../controllers/stall.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// POST /api/stalls — create stall
router.post('/', authenticate, createStall);

// GET /api/stalls/event/:event_id — get all stalls for an event
router.get('/event/:event_id', getEventStalls);

// GET /api/stalls/:id — get stall details
router.get('/:id', getStall);

// GET /api/stalls/:id/menu — get stall menu
router.get('/:id/menu', getStallMenu);

// POST /api/stalls/:id/menu — add menu item
router.post('/:id/menu', authenticate, addMenuItem);

// PATCH /api/stalls/:id/menu/:itemId — update menu item
router.patch('/:id/menu/:itemId', authenticate, updateMenuItem);

// DELETE /api/stalls/:id/menu/:itemId — delete menu item
router.delete('/:id/menu/:itemId', authenticate, deleteMenuItem);

module.exports = router;