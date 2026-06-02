# QueueUp — Backend API

The core REST + WebSocket server for QueueUp — a digital ordering platform for food carnivals and events. Handles authentication, event and stall management, order lifecycle, Razorpay payments, Socket.io real-time updates, Ghost Order collection verification, and post-event stall payouts via a Bull queue.

Runs on **port 3000**. Integrates with the [NLP microservice](../QueueUp-NLP) on port 8001 for push notifications and wait-time feedback.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 18+, Express 5 |
| Database | PostgreSQL (AWS RDS) |
| Cache / Sessions | Redis Cloud |
| Auth | JWT (phone OTP flow) |
| Payments | Razorpay (orders + webhooks + payouts) |
| Real-time | Socket.io 4 |
| Queue | Bull (post-event payout processing) |
| Security | Helmet, express-rate-limit, HMAC-SHA256 (Ghost Order) |

---

## Project Structure

```
src/
├── server.js                  # Entry point — HTTP server, Socket.io setup, global io
├── app.js                     # Express app — middleware, route registration
├── config/
│   ├── database.js            # PostgreSQL pool (pg)
│   ├── redis.js               # Redis client
│   └── migrate.js             # Schema migration runner
├── controllers/
│   ├── auth.controller.js     # OTP send/verify, JWT issue
│   ├── event.controller.js    # Event CRUD + end-event trigger
│   ├── stall.controller.js    # Stall CRUD + menu management
│   ├── order.controller.js    # Order creation, status updates, Razorpay webhook
│   ├── ghost.controller.js    # Ghost Order pattern generation + clock sync
│   ├── payout.controller.js   # Payout initiation + history
│   └── user.controller.js     # User profile + FCM token registration
├── middlewares/
│   ├── auth.middleware.js     # JWT authenticate + role-based authorize
│   ├── validate.middleware.js # express-validator helpers
│   └── error.middleware.js    # Global error handler
├── routes/
│   ├── auth.routes.js
│   ├── event.routes.js
│   ├── stall.routes.js
│   ├── order.routes.js        # Includes Razorpay create + webhook routes
│   ├── ghost.routes.js
│   ├── payout.routes.js
│   └── user.routes.js
├── services/
│   ├── payout.service.js      # Earnings calculation, Razorpay transfer
│   └── payoutQueue.service.js # Bull queue — schedules payouts after event ends
└── utils/
    ├── notifyNLP.js           # Fire-and-forget POST to NLP service
    ├── orderNumber.js         # Human-readable order number generator
    └── response.js            # Standardised success/error response helpers
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL instance (AWS RDS or local)
- Redis instance (Redis Cloud or local)
- [Razorpay](https://razorpay.com) account (test keys work for development)
- Firebase project (for FCM — credentials shared with the NLP service)

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

```env
NODE_ENV=development
PORT=3000

# PostgreSQL
DB_HOST=your-rds-host.rds.amazonaws.com
DB_PORT=5432
DB_NAME=queueup
DB_USER=queueup_admin
DB_PASSWORD=your_password

# Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_64_char_hex_secret
JWT_EXPIRES_IN=7d

# Razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=your_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Firebase (for FCM — must match NLP service .env)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key

# Ghost Order Protection
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
GHOST_SECRET=your_32_byte_hex
GHOST_WINDOW_MS=30000

# NLP service
NLP_SERVICE_URL=http://localhost:8001
NLP_INTERNAL_SECRET=your_shared_secret
```

### 3. Run database migrations

```bash
npm run migrate
```

### 4. Start the development server

```bash
npm run dev    # nodemon hot-reload
npm start      # production
```

Server starts on [http://localhost:3000](http://localhost:3000). Health check: [http://localhost:3000/health](http://localhost:3000/health).

---

## API Reference

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/send-otp` | — | Send OTP to phone number |
| `POST` | `/api/auth/verify-otp` | — | Verify OTP and receive JWT |

### Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users/:id` | ✓ | Get user profile |
| `PATCH` | `/api/users/:id` | ✓ | Update user profile |
| `PATCH` | `/api/users/fcm-token` | ✓ | Register FCM device token for push notifications |

### Events

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/events` | ✓ | Create event (organiser) |
| `GET` | `/api/events` | — | List all events |
| `GET` | `/api/events/:id` | — | Get event details |
| `PATCH` | `/api/events/:id/status` | ✓ | Update event status |
| `POST` | `/api/events/:id/end` | ✓ | End event and trigger Bull payout queue |

### Stalls

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/stalls` | ✓ | Create stall |
| `GET` | `/api/stalls/event/:event_id` | — | Get all stalls for an event |
| `GET` | `/api/stalls/:id` | — | Get stall details |
| `GET` | `/api/stalls/:id/menu` | — | Get stall menu |
| `POST` | `/api/stalls/:id/menu` | ✓ | Add menu item |
| `PATCH` | `/api/stalls/:id/menu/:itemId` | ✓ | Update menu item |
| `DELETE` | `/api/stalls/:id/menu/:itemId` | ✓ | Delete menu item |

### Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/orders` | ✓ | Place an order |
| `GET` | `/api/orders/customer/me` | ✓ | Get all orders for the logged-in customer |
| `GET` | `/api/orders/stall/:stall_id` | ✓ | Get active orders for a stall (kitchen view) |
| `POST` | `/api/orders/razorpay/create` | ✓ | Create Razorpay payment order |
| `POST` | `/api/orders/razorpay/webhook` | — | Razorpay payment confirmation webhook |
| `GET` | `/api/orders/:id` | ✓ | Get order details |
| `PATCH` | `/api/orders/:id/status` | ✓ | Update order status |

**Order statuses:** `pending` → `paid` → `preparing` → `ready` → `collected` / `cancelled`

Every status transition fires an NLP notification (FCM push) to the customer and emits a Socket.io event to the relevant room.

### Ghost Order (collection verification)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/ghost/time` | — | Server timestamp for client clock sync |
| `GET` | `/api/ghost/pattern/:orderId` | ✓ | Get animated collection pattern for a ready order |

### Payouts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/payouts` | ✓ stall_owner / organiser | Initiate a payout |
| `GET` | `/api/payouts` | ✓ | Get my payout history |

---

## Real-time (Socket.io)

Clients connect to the same port as the HTTP server. Two room types:

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join_stall` | client → server | `stall_id` | Stall owner joins their kitchen room |
| `join_order` | client → server | `order_id` | Customer joins their order room |
| `new_order` | server → stall room | order object | Fires when a new order is placed |
| `order_status_update` | server → order room | order object | Fires on any status change |
| `order:collected` | server → stall room | `{ orderId, status }` | Fires when collected — invalidates Ghost Pattern on both screens |

---

## Ghost Order Protection

Ghost Order prevents fraudulent food collection (screenshotting someone else's "order ready" notification). When an order reaches `ready` status:

1. The server generates a time-windowed HMAC-SHA256 seed from `orderId + window` using `GHOST_SECRET`.
2. The seed deterministically drives a 3-ring animated SVG pattern and a 3-character alphanumeric center code.
3. Both the customer's phone and the stall owner's screen call `/api/ghost/pattern/:orderId` — they receive identical patterns.
4. The pattern rotates every `GHOST_WINDOW_MS` (default 30 seconds), making screenshots useless.
5. When the order is marked `collected`, the server emits `order:collected` to both rooms — both screens immediately destroy the pattern.

---

## NLP Integration

The backend calls the NLP microservice asynchronously via `notifyNLP()` for all push notifications. Failures are logged but never block order responses.

Events fired:

| Trigger | NLP Event |
|---------|-----------|
| Order marked `paid` | `ORDER_CONFIRMED` |
| Order marked `preparing` | `ORDER_PREPARING` |
| Order marked `ready` | `ORDER_READY` |
| Order marked `cancelled` | `ORDER_CANCELLED` |
| Order marked `collected` | `FEEDBACK_PREP_TIME` (records prep time for wait-time ML) |

The NLP service must share the same `FIREBASE_PROJECT_ID` / key and `NLP_INTERNAL_SECRET`. See [QueueUp-NLP](../QueueUp-NLP) for setup.

---

## Payout Flow

1. Organiser calls `POST /api/events/:id/end`.
2. Backend enqueues a Bull job per stall owner.
3. `payoutQueue.service.js` processes each job: calculates collected-order earnings, deducts 2.5% platform fee, creates a `payouts` record, and initiates a Razorpay transfer.
4. On success, the NLP service fires a `PAYOUT_PROCESSED` push notification to the stall owner.

---

## Rate Limiting

All `/api/*` routes are rate-limited to **100 requests per 15 minutes** per IP via `express-rate-limit`. Adjust in `app.js` before going to production.

---

## Tests

```bash
npm test    # Jest, runs in band
```
