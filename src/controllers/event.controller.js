const { pool } = require('../config/database');
const { success, error } = require('../utils/response');


const { scheduleEventPayouts } = require('../services/payoutQueue.service');

// POST /api/events — create event (organiser only)
const createEvent = async (req, res) => {
  const { name, description, location, start_time, end_time } = req.body;
  const organiser_id = req.user.id;

  if (!name || !location || !start_time || !end_time)
    return error(res, 'Name, location, start time and end time are required');

  try {
    const event = await pool.query(
      `INSERT INTO events (organiser_id, name, description, location, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [organiser_id, name, description, location, start_time, end_time]
    );
    return success(res, event.rows[0], 'Event created successfully', 201);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to create event', 500);
  }
};

// GET /api/events — list all events
const getEvents = async (req, res) => {
  try {
    const events = await pool.query(
      'SELECT * FROM events ORDER BY created_at DESC'
    );
    return success(res, events.rows);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get events', 500);
  }
};

// GET /api/events/:id — get single event
const getEvent = async (req, res) => {
  const { id } = req.params;
  try {
    const event = await pool.query(
      'SELECT * FROM events WHERE id = $1', [id]
    );
    if (event.rows.length === 0) return error(res, 'Event not found', 404);
    return success(res, event.rows[0]);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get event', 500);
  }
};

// PATCH /api/events/:id/status — update event status
const updateEventStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['upcoming', 'live', 'ended'].includes(status))
    return error(res, 'Invalid status');

  try {
    const event = await pool.query(
      'UPDATE events SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (event.rows.length === 0) return error(res, 'Event not found', 404);
    return success(res, event.rows[0], 'Event status updated');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to update event status', 500);
  }
};

// POST /api/events/:id/end — end event and schedule payouts
const endEvent = async (req, res) => {
  const { id } = req.params;
  try {
    // Mark event as ended
    const event = await pool.query(
      `UPDATE events SET status = 'ended', updated_at = NOW() 
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (event.rows.length === 0) return error(res, 'Event not found', 404);

    // Get all stall owners for this event
    const stalls = await pool.query(
      `SELECT DISTINCT owner_id FROM stalls WHERE event_id = $1`,
      [id]
    );

    const stall_owner_ids = stalls.rows.map(s => s.owner_id);

    // Schedule payouts for all stall owners (2 hours later)
    await scheduleEventPayouts(id, stall_owner_ids);

    return success(res, event.rows[0], 'Event ended and payouts scheduled!');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to end event', 500);
  }
};

module.exports = { createEvent, getEvents, getEvent, updateEventStatus, endEvent };