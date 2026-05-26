const redis = require('redis');
const client = redis.createClient();
client.on('connect', () => {
  console.log('Redis connected');
});
client.on('error', (err) => {
  console.log('Redis error:', err);
});
module.exports = client;