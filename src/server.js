require('dotenv').config({ quiet: true });
if (process.env.NODE_ENV !== 'production') {
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('ENV COUNT:', Object.keys(process.env).length);
}
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  await connectRedis();

  // Create HTTP server
  const server = http.createServer(app);

  // Attach Socket.io
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Make io accessible in controllers via req.app.get('io')
  app.set('io', io);

  // FIX: also expose io globally so Razorpay webhook handler can access it.
  // Webhook requests don't go through the normal req.app chain in all setups,
  // and the webhook route is intentionally mounted without authenticate middleware.
  global._io = io;

  io.on('connection', (socket) => {
    console.log(`⚡ Client connected: ${socket.id}`);

    // Stall owner joins their stall room
    socket.on('join_stall', (stall_id) => {
      socket.join(`stall:${stall_id}`);
      console.log(`🏪 Stall owner joined room: stall:${stall_id}`);
    });

    // Customer joins their order room
    socket.on('join_order', (order_id) => {
      socket.join(`order:${order_id}`);
      console.log(`📦 Customer joined room: order:${order_id}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  server.listen(PORT, () => {
    console.log(`🚀 QueueUp server running on port ${PORT}`);
  });
};

startServer();