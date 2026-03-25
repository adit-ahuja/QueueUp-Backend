const axios = require('axios');

const notifyNLP = async (event, data) => {
  const nlpUrl = process.env.NLP_SERVICE_URL || 'http://localhost:8001';
  try {
    await axios.post(`${nlpUrl}/notifications/trigger`, {
      event,
      data
    }, {
      headers: {
        'x-internal-secret': process.env.NLP_INTERNAL_SECRET
      },
      timeout: 5000, // don't let NLP latency stall order responses
    });
    console.log(`⚡ NLP notified: ${event}`);
  } catch (err) {
    // NLP failures are non-fatal — log and move on so orders aren't blocked
    console.error(`⚠️ NLP notification failed for ${event}:`, err.message);
  }
};

module.exports = { notifyNLP };