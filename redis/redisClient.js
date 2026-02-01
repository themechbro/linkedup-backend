const { createClient } = require("redis");

const redis = createClient({
  url: "redis://localhost:6379",
});

redis.on("error", (err) => console.error("Redis Error", err));

(async () => {
  await redis.connect();
})();

module.exports = redis;
