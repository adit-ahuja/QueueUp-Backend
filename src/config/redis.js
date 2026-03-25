const { createClient } = require('redis');

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => console.error('Redis error:', err));

const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('✅ Redis connected');
  } catch (err) {
    console.error('❌ Redis connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = { redisClient, connectRedis };
