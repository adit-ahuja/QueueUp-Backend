// Generates short, readable order numbers like Q-4821
const generateOrderNumber = () => `Q-${Math.floor(1000 + Math.random() * 9000)}`;

module.exports = { generateOrderNumber };
