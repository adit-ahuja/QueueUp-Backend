const express = require('express');
const router = express.Router();
const { createEvent, getEvents, getEvent, updateEventStatus, endEvent } = require('../controllers/event.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// POST /api/events — create event
router.post('/', authenticate, createEvent);

// GET /api/events — list all events
router.get('/', getEvents);

// GET /api/events/:id — get single event
router.get('/:id', getEvent);

// PATCH /api/events/:id/status — update status
router.patch('/:id/status', authenticate, updateEventStatus);

// POST /api/events/:id/end — end event and schedule payouts
router.post('/:id/end', authenticate, endEvent);

module.exports = router;