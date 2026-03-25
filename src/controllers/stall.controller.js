const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

// POST /api/stalls — create stall
const createStall = async (req, res) => {
  const { event_id, name, description, category } = req.body;
  const owner_id = req.user.id;

  if (!event_id || !name)
    return error(res, 'Event ID and stall name are required');

  try {
    const stall = await pool.query(
      `INSERT INTO stalls (event_id, owner_id, name, description, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [event_id, owner_id, name, description, category]
    );
    return success(res, stall.rows[0], 'Stall created successfully', 201);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to create stall', 500);
  }
};

// GET /api/stalls/:id — get stall details
const getStall = async (req, res) => {
  const { id } = req.params;
  try {
    const stall = await pool.query(
      'SELECT * FROM stalls WHERE id = $1', [id]
    );
    if (stall.rows.length === 0) return error(res, 'Stall not found', 404);
    return success(res, stall.rows[0]);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get stall', 500);
  }
};

// GET /api/stalls/:id/menu — get stall menu
// FIX: added ?include_unavailable=true support for StallMenuMgmtScreen (owner view).
// Without this, owners couldn't see items they had toggled off — they'd silently
// disappear from the management screen with no way to re-enable them.
// Customers never send this param so they continue to see only available items.
const getStallMenu = async (req, res) => {
  const { id } = req.params;
  const includeUnavailable = req.query.include_unavailable === 'true';
  try {
    const query = includeUnavailable
      ? 'SELECT * FROM menu_items WHERE stall_id = $1 ORDER BY created_at ASC'
      : 'SELECT * FROM menu_items WHERE stall_id = $1 AND is_available = true ORDER BY created_at ASC';

    const items = await pool.query(query, [id]);
    return success(res, items.rows);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get menu', 500);
  }
};

// POST /api/stalls/:id/menu — add menu item
const addMenuItem = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, tags } = req.body;

  if (!name || !price)
    return error(res, 'Item name and price are required');

  try {
    const item = await pool.query(
      `INSERT INTO menu_items (stall_id, name, description, price, tags)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, name, description, price, tags]
    );
    return success(res, item.rows[0], 'Menu item added successfully', 201);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to add menu item', 500);
  }
};

// GET /api/stalls/event/:event_id — get all stalls for an event
const getEventStalls = async (req, res) => {
  const { event_id } = req.params;
  try {
    const stalls = await pool.query(
      'SELECT * FROM stalls WHERE event_id = $1 AND is_active = true',
      [event_id]
    );
    return success(res, stalls.rows);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get stalls', 500);
  }
};

// PATCH /api/stalls/:id/menu/:itemId — update menu item
const updateMenuItem = async (req, res) => {
  const { itemId } = req.params;
  const { name, description, price, is_available, tags } = req.body;

  try {
    const item = await pool.query(
      `UPDATE menu_items SET 
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       price = COALESCE($3, price),
       is_available = COALESCE($4, is_available),
       tags = COALESCE($5, tags)
       WHERE id = $6 RETURNING *`,
      [name, description, price, is_available, tags, itemId]
    );
    if (item.rows.length === 0) return error(res, 'Menu item not found', 404);
    return success(res, item.rows[0], 'Menu item updated successfully');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to update menu item', 500);
  }
};

// DELETE /api/stalls/:id/menu/:itemId — delete menu item
// DELETE /api/stalls/:id/menu/:itemId — delete menu item
const deleteMenuItem = async (req, res) => {
  const { itemId } = req.params;

  try {
    // Check if menu item has existing orders
    const orders = await pool.query(
      'SELECT id FROM order_items WHERE menu_item_id = $1 LIMIT 1',
      [itemId]
    );

    if (orders.rows.length > 0) {
      // Has orders — mark as unavailable instead of deleting
      const item = await pool.query(
        'UPDATE menu_items SET is_available = false WHERE id = $1 RETURNING *',
        [itemId]
      );
      return success(res, item.rows[0], 'Menu item marked as unavailable (has existing orders)');
    }

    // No orders — safe to delete
    const item = await pool.query(
      'DELETE FROM menu_items WHERE id = $1 RETURNING *',
      [itemId]
    );
    if (item.rows.length === 0) return error(res, 'Menu item not found', 404);
    return success(res, item.rows[0], 'Menu item deleted successfully');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to delete menu item', 500);
  }
};

module.exports = { createStall, getStall, getStallMenu, addMenuItem, getEventStalls, updateMenuItem, deleteMenuItem };