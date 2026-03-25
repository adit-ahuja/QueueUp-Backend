# QueueUp Backend API

Smart ordering platform for food carnivals & events.

## Stack
- **Runtime**: Node.js + Express
- **Database**: PostgreSQL (AWS RDS)
- **Cache/Sessions**: Redis
- **Auth**: JWT
- **Payments**: Razorpay
- **Real-time**: Socket.io
- **Queue**: Bull (for payouts)

## Setup
```bash
npm install
cp .env.example .env   # fill in your values
npm run migrate        # run DB schema migrations
npm run dev            # start dev server
```

## Project Structure
```
src/
├── config/       → DB, Redis, migrations
├── controllers/  → Route handler logic
├── middlewares/  → Auth, validation, error handling
├── models/       → DB query functions (Week 2)
├── routes/       → API route definitions
├── services/     → Business logic (Week 2)
└── utils/        → Helpers (response, order number)
tests/            → Jest test suites (Week 2)
```

## API Endpoints (Week 2)
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/auth/send-otp | Send OTP to phone |
| POST | /api/auth/verify-otp | Verify OTP & get JWT |
| GET | /api/users/:id | Get user profile |
| POST | /api/events | Create event (organiser) |
| GET | /api/events/:id | Get event details |
| POST | /api/stalls | Create stall |
| GET | /api/stalls/:id/menu | Get stall menu |
| POST | /api/orders | Place order |
| PATCH | /api/orders/:id/status | Update order status |
