const { pool } = require('../config/database');
const { redisClient } = require('../config/redis');
const { success, error } = require('../utils/response');
const { generateOrderNumber } = require('../utils/orderNumber');
const { notifyNLP } = require('../utils/notifyNLP');

// POST /api/orders — place an order
const createOrder = async (req, res) => {
  const { stall_id, event_id, items } = req.body;
  const customer_id = req.user.id;

  if (!stall_id || !event_id || !items || items.length === 0)
    return error(res, 'Stall ID, event ID and items are required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calculate total amount
    let total_amount = 0;
    for (const item of items) {
      const menuItem = await client.query(
        'SELECT * FROM menu_items WHERE id = $1 AND is_available = true',
        [item.menu_item_id]
      );
      if (menuItem.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return error(res, `Menu item ${item.menu_item_id} not found`);
      }
      total_amount += menuItem.rows[0].price * item.quantity;
    }

    // Create order
    const order_number = generateOrderNumber();
    const order = await client.query(
      `INSERT INTO orders (customer_id, stall_id, event_id, order_number, total_amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [customer_id, stall_id, event_id, order_number, total_amount]
    );

    const orderId = order.rows[0].id;

    // Insert order items
    for (const item of items) {
      const menuItem = await client.query(
        'SELECT price FROM menu_items WHERE id = $1',
        [item.menu_item_id]
      );
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.menu_item_id, item.quantity, menuItem.rows[0].price]
      );
    }

    await client.query('COMMIT');

    // Cache order in Redis for fast access
    await redisClient.setEx(
      `order:${orderId}`,
      3600,
      JSON.stringify(order.rows[0])
    );

    // Notify stall owner of new order via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`stall:${stall_id}`).emit('new_order', order.rows[0]);
      console.log(`⚡ New order emitted to stall:${stall_id}`);
    }

    return success(res, order.rows[0], 'Order placed successfully', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return error(res, 'Failed to place order', 500);
  } finally {
    client.release();
  }
};

// GET /api/orders/:id — get order details
const getOrder = async (req, res) => {
  const { id } = req.params;
  try {
    // Check Redis cache first
    const cached = await redisClient.get(`order:${id}`);
    if (cached) return success(res, JSON.parse(cached));

    const order = await pool.query(
      `SELECT o.*, array_agg(
        json_build_object(
          'menu_item_id', oi.menu_item_id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price
        )
      ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id`,
      [id]
    );
    if (order.rows.length === 0) return error(res, 'Order not found', 404);
    return success(res, order.rows[0]);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get order', 500);
  }
};

// PATCH /api/orders/:id/status — update order status
const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'paid', 'preparing', 'ready', 'collected', 'cancelled'];
  if (!validStatuses.includes(status))
    return error(res, 'Invalid status');

  try {
    const order = await pool.query(
      `UPDATE orders SET status = $1::varchar, 
       collected_at = CASE WHEN $1::varchar = 'collected' THEN NOW() ELSE collected_at END,
       updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (order.rows.length === 0) return error(res, 'Order not found', 404);

    // Update Redis cache
    await redisClient.setEx(
      `order:${id}`,
      3600,
      JSON.stringify(order.rows[0])
    );

    // Notify customer of order status change via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`order:${id}`).emit('order_status_update', order.rows[0]);
      console.log(`⚡ Order status update emitted to order:${id}`);

      // FIX: emit order:collected to the stall room so GhostPattern self-destructs
      // on BOTH screens. Payload must match useGhostPattern GHOST_COLLECTED_EVENT contract:
      // { orderId: string, status: 'collected' }
      if (status === 'collected') {
        io.to(`stall:${order.rows[0].stall_id}`).emit('order:collected', {
          orderId: id,
          status: 'collected',
        });
        console.log(`⚡ order:collected emitted to stall:${order.rows[0].stall_id}`);
      }
    }

    // Fetch customer FCM token and stall name for notifications
    const customer = await pool.query(
      `SELECT u.fcm_token, s.name AS stall_name
       FROM users u
       LEFT JOIN stalls s ON s.id = $2
       WHERE u.id = $1`,
      [order.rows[0].customer_id, order.rows[0].stall_id]
    );
    const fcm_token  = customer.rows[0]?.fcm_token;
    const stall_name = customer.rows[0]?.stall_name || '';

    if (fcm_token) {
      if (status === 'paid') {
        await notifyNLP('ORDER_CONFIRMED', {
          recipient_fcm_token: fcm_token,
          order_id: order.rows[0].id,
          order_number: order.rows[0].order_number,
          stall_name,
          item_summary: req.body.item_summary || '',
          estimated_wait_minutes: 10,
          total_amount: parseFloat(order.rows[0].total_amount),
        });
      } else if (status === 'preparing') {
        await notifyNLP('ORDER_PREPARING', {
          recipient_fcm_token: fcm_token,
          order_id: order.rows[0].id,
          order_number: order.rows[0].order_number,
          stall_name,
        });
      } else if (status === 'ready') {
        await notifyNLP('ORDER_READY', {
          recipient_fcm_token: fcm_token,
          order_id: order.rows[0].id,
          order_number: order.rows[0].order_number,
          stall_name,
        });
      } else if (status === 'cancelled') {
        await notifyNLP('ORDER_CANCELLED', {
          recipient_fcm_token: fcm_token,
          order_id: order.rows[0].id,
          order_number: order.rows[0].order_number,
          stall_name,
          refund_amount: parseFloat(order.rows[0].total_amount),
        });
      }
    }

    // If order collected, send prep time feedback
    if (status === 'collected') {
      await notifyNLP('FEEDBACK_PREP_TIME', {
        order_id: id,
        stall_id: order.rows[0].stall_id,
        created_at: order.rows[0].created_at,
        collected_at: order.rows[0].collected_at,
      });
    }

    return success(res, order.rows[0], 'Order status updated');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to update order status', 500);
  }
};

// GET /api/orders/stall/:stall_id — get all orders for a stall (live dashboard)
const getStallOrders = async (req, res) => {
  const { stall_id } = req.params;
  try {
    const orders = await pool.query(
      `SELECT * FROM orders WHERE stall_id = $1 
       AND status NOT IN ('collected', 'cancelled')
       ORDER BY created_at ASC`,
      [stall_id]
    );
    return success(res, orders.rows);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get stall orders', 500);
  }
};

// POST /api/orders/razorpay/create — create Razorpay payment order
const createRazorpayOrder = async (req, res) => {
  const { amount, order_id } = req.body;

  if (!amount || !order_id)
    return error(res, 'Amount and order ID are required');

  try {
    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: order_id,
      notes: { order_id }
    });

    return success(res, {
      razorpay_order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID
    }, 'Razorpay order created');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to create Razorpay order', 500);
  }
};


// GET /api/orders/customer/me — get all orders for the logged-in customer
// FIX: This was missing entirely — OrdersListScreen calls this on mount
const getCustomerOrders = async (req, res) => {
  const customer_id = req.user.id;
  try {
    const orders = await pool.query(
      `SELECT o.*,
              s.name AS stall_name,
              array_agg(
                json_build_object(
                  'menu_item_id', oi.menu_item_id,
                  'quantity', oi.quantity,
                  'unit_price', oi.unit_price,
                  'name', mi.name
                )
              ) AS items
       FROM orders o
       LEFT JOIN stalls s ON o.stall_id = s.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE o.customer_id = $1
       GROUP BY o.id, s.name
       ORDER BY o.created_at DESC`,
      [customer_id]
    );
    return success(res, orders.rows);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to get customer orders', 500);
  }
};

// POST /api/orders/razorpay/webhook — Razorpay calls this after payment success
// FIX: was completely missing — CheckoutScreen depends on order being marked paid
// IMPORTANT: In app.js, mount this route BEFORE express.json() middleware
// so rawBody is available for signature verification. See app.js note.
const razorpayWebhook = async (req, res) => {
  const crypto = require('crypto');
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // Verify Razorpay signature
  const receivedSig = req.headers['x-razorpay-signature'];
  const expectedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(req.rawBody || JSON.stringify(req.body))
    .digest('hex');

  if (receivedSig !== expectedSig) {
    console.warn('⚠️  Razorpay webhook signature mismatch');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body;

  // Only handle payment.captured — this is the definitive "payment succeeded" event
  if (event.event !== 'payment.captured') {
    return res.status(200).json({ received: true });
  }

  const payment = event.payload.payment.entity;
  const order_id = payment.notes?.order_id; // we set this in createRazorpayOrder

  if (!order_id) {
    console.warn('⚠️  Razorpay webhook: no order_id in payment notes');
    return res.status(200).json({ received: true });
  }

  try {
    const order = await pool.query(
      `UPDATE orders
       SET status = 'paid',
           payment_id = $1,
           payment_method = 'razorpay',
           updated_at = NOW()
       WHERE id = $2
         AND status = 'pending'
       RETURNING *`,
      [payment.id, order_id]
    );

    if (order.rows.length === 0) {
      // Already paid or order not found — idempotent, still return 200
      return res.status(200).json({ received: true });
    }

    // Invalidate Redis cache so next read gets fresh paid status
    await redisClient.del(`order:${order_id}`);

    // Notify customer via socket that payment went through
    // app.get('io') won't work in a webhook context without req.app — use global io
    // server.js sets this: global._io = io;  (see server.js fix note)
    const io = global._io;
    if (io) {
      io.to(`order:${order_id}`).emit('order_status_update', order.rows[0]);
      console.log(`⚡ Razorpay webhook: order ${order_id} marked paid, socket notified`);
    }

    // FCM notification
    const customer = await pool.query(
      'SELECT fcm_token FROM users WHERE id = $1',
      [order.rows[0].customer_id]
    );
    const fcm_token = customer.rows[0]?.fcm_token;
    if (fcm_token) {
      await notifyNLP('ORDER_CONFIRMED', {
        recipient_fcm_token: fcm_token,
        order_id: order.rows[0].id,
        order_number: order.rows[0].order_number,
        total_amount: parseFloat(order.rows[0].total_amount),
        stall_name: '',
        item_summary: '',
        estimated_wait_minutes: 10,
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Razorpay webhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

module.exports = { createOrder, getOrder, getCustomerOrders, updateOrderStatus, getStallOrders, createRazorpayOrder, razorpayWebhook };