/**
 * ghost.controller.js
 * Ghost Order Protection — Server-side crypto engine
 *
 * Two endpoints:
 *   GET /api/ghost/time           → server timestamp for client clock sync
 *   GET /api/ghost/pattern/:id    → deterministic animated pattern for an order
 *
 * How it works:
 *   1. A time window is calculated: window = floor(now / WINDOW_MS)
 *   2. HMAC-SHA256(orderId + ':' + window, GHOST_SECRET) → 32-byte seed
 *   3. Seed bytes deterministically drive 3 ring parameters + a 3-char code
 *   4. Customer phone and stall screen both call this endpoint → same seed
 *      → identical pattern → visual match proves collection is legitimate
 *
 * Attack resistance:
 *   - Screenshot replay: pattern changes every WINDOW_MS (default 30s)
 *   - Pattern sharing: window has already expired by the time it arrives
 *   - Time manipulation: server time is canonical via /ghost/time
 *   - Brute force: HMAC-SHA256 with a 256-bit secret
 */

const crypto = require('crypto');
const { pool } = require('../config/database');
const { success, error } = require('../utils/response');

const WINDOW_MS   = parseInt(process.env.GHOST_WINDOW_MS  || '30000', 10); // 30 s
const GHOST_SECRET = process.env.GHOST_SECRET || 'change_this_ghost_secret_in_production';

// Colour palette — distinct enough to be unambiguous at a glance
const COLOURS = [
  '#7C3AED', '#2563EB', '#059669', '#DC2626',
  '#D97706', '#0891B2', '#9333EA', '#16A34A',
  '#EA580C', '#0284C7',
];

// Base-36 charset for the 3-char center code (avoids ambiguous 0/O, 1/I/l)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Derive a deterministic pattern from a 32-byte seed buffer.
 * Uses successive seed bytes so rings are independent of each other.
 */
function seedToPattern(seedBuf) {
  const b = seedBuf; // Uint8Array / Buffer of 32 bytes

  const rings = [
    {
      segs:      2 + (b[0] % 4),                    // 2–5 segments
      speed:     3000 + (((b[1] << 8) | b[2]) % 4000), // 3–7 s per rotation
      direction: b[3] % 2 === 0 ? 1 : -1,
      color:     COLOURS[b[4] % COLOURS.length],
    },
    {
      segs:      3 + (b[8] % 4),                    // 3–6 segments
      speed:     2000 + (((b[9] << 8) | b[10]) % 3000),
      direction: b[11] % 2 === 0 ? 1 : -1,
      color:     COLOURS[(b[4] + 3) % COLOURS.length], // offset from ring 1
    },
    {
      segs:      2 + (b[16] % 3),                   // 2–4 segments
      speed:     1500 + (((b[17] << 8) | b[18]) % 2500),
      direction: b[19] % 2 === 0 ? 1 : -1,
      color:     COLOURS[(b[4] + 6) % COLOURS.length],
    },
  ];

  // 3-char human-readable code from last 3 bytes
  const code = [b[29], b[30], b[31]]
    .map(byte => CODE_CHARS[byte % CODE_CHARS.length])
    .join('');

  return { rings, code };
}

/**
 * GET /api/ghost/time
 * Returns the server's current Unix timestamp in milliseconds.
 * Clients call this once on app load to calculate their clock offset.
 */
const getServerTime = (req, res) => {
  return res.json({
    success: true,
    data: { serverTime: Date.now() },
  });
};

/**
 * GET /api/ghost/pattern/:orderId
 * Returns the animated pattern for an order that is in "ready" state.
 *
 * Response codes:
 *   200 — pattern object
 *   404 — order not found
 *   409 — order not ready yet (client should poll every 3 s)
 *   410 — order already collected — pattern invalidated (client stops refreshing)
 *   403 — caller is neither the customer nor the stall owner of this order
 */
const getPattern = async (req, res) => {
  const { orderId } = req.params;
  const callerId    = req.user?.id;

  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.customer_id, o.stall_id,
              s.owner_id AS stall_owner_id
       FROM orders o
       JOIN stalls s ON s.id = o.stall_id
       WHERE o.id = $1`,
      [orderId]
    );

    if (result.rows.length === 0)
      return error(res, 'Order not found', 404);

    const order = result.rows[0];

    // Only the customer or the stall owner may see the pattern
    if (callerId !== order.customer_id && callerId !== order.stall_owner_id)
      return error(res, 'Forbidden', 403);

    if (order.status === 'collected')
      return res.status(410).json({ success: false, error: 'Order already collected' });

    if (order.status !== 'ready')
      return res.status(409).json({
        success: false,
        error: 'Order not ready for collection yet',
        status: order.status,
      });

    // ── Seed generation ───────────────────────────────────────────────────
    const now       = Date.now();
    const window    = Math.floor(now / WINDOW_MS);
    const expiresAt = (window + 1) * WINDOW_MS;

    const seed = crypto
      .createHmac('sha256', GHOST_SECRET)
      .update(`${orderId}:${window}`)
      .digest(); // Buffer of 32 bytes

    const pattern = seedToPattern(seed);

    // Persist the current token so the collected check can verify it later
    await pool.query(
      `UPDATE orders SET ghost_order_token = $1 WHERE id = $2`,
      [seed.toString('hex'), orderId]
    );

    return res.json({
      success: true,
      data: {
        orderId,
        seed:       seed.toString('hex'),
        pattern,
        windowMs:   WINDOW_MS,
        expiresAt,
        serverTime: now,
      },
    });
  } catch (err) {
    console.error('[Ghost] getPattern error:', err);
    return error(res, 'Failed to generate pattern', 500);
  }
};

module.exports = { getServerTime, getPattern };
