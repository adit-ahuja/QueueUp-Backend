// PATCH: order.routes.js — fixes applied:
// 1. Added GET /api/orders/customer/me BEFORE /:id so Express doesn't eat "customer" as :id param
// 2. Added POST /api/orders/razorpay/webhook for Razorpay payment confirmation
// 3. POST /api/orders/razorpay/create moved above /:id for same reason

const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrder,
  getCustomerOrders,
  updateOrderStatus,
  getStallOrders,
  createRazorpayOrder,
  razorpayWebhook,
} = require('../controllers/order.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// POST /api/orders — place an order
router.post('/', authenticate, createOrder);

// ─── Static-segment routes MUST come before /:id ──────────────────────────
// GET /api/orders/customer/me — get all orders for the logged-in customer
// FIX: was missing entirely; Express was matching "customer" as :id param
router.get('/customer/me', authenticate, getCustomerOrders);

// GET /api/orders/stall/:stall_id — get all orders for a stall
router.get('/stall/:stall_id', authenticate, getStallOrders);

// POST /api/orders/razorpay/create — create Razorpay payment order
// FIX: moved above /:id so "razorpay" isn't captured as :id
router.post('/razorpay/create', authenticate, createRazorpayOrder);

// POST /api/orders/razorpay/webhook — Razorpay calls this after payment
// FIX: new route — marks order as paid after Razorpay confirms payment
// Must be raw body for signature verification — see webhook handler note
router.post('/razorpay/webhook', razorpayWebhook);

// ─── Dynamic :id routes AFTER all static segments ─────────────────────────
// GET /api/orders/:id — get order details
router.get('/:id', authenticate, getOrder);

// PATCH /api/orders/:id/status — update order status
router.patch('/:id/status', authenticate, updateOrderStatus);

module.exports = router;
