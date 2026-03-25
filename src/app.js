const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const eventRoutes = require('./routes/event.routes');
const stallRoutes = require('./routes/stall.routes');
const orderRoutes = require('./routes/order.routes');
const payoutRoutes = require('./routes/payout.routes');
const ghostRoutes = require('./routes/ghost.routes');
const { errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
// FIX: Razorpay webhook signature verification requires the raw request body.
// express.json() consumes the body stream — once parsed, rawBody is gone.
// Solution: capture rawBody BEFORE express.json() runs, but only for the webhook route.
app.use((req, res, next) => {
  if (req.path === '/api/orders/razorpay/webhook') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      req.rawBody = data;
      req.body = JSON.parse(data || '{}');
      next();
    });
  } else {
    next();
  }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/stalls', stallRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/ghost', ghostRoutes);

app.get('/health', (req, res) => res.json({ status: 'OK', service: 'QueueUp API' }));
app.use(errorHandler);

module.exports = app;
