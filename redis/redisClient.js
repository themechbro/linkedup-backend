const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("Redis:Max reconnection Attempts reached");
        return new Error("Redis Connection Failed");
      }
      return retries * 100;
    },
  },
});

redis.on("error", (err) => console.error("Redis Error", err));
redis.on("connect", () => console.log("Redis: Connected"));
redis.on("reconnecting", () => console.log("Redis: Reconnecting..."));
redis.on("ready", () => console.log("Redis: Ready"));

let isConnected = false;

const connectRedis = async () => {
  if (!isConnected) {
    try {
      await redis.connect();
      isConnected = true;
    } catch (err) {
      console.error("Failed to connect to Redis:", err);
      throw err;
    }
  }
};

connectRedis();

// Graceful shutdown
process.on("SIGINT", async () => {
  if (isConnected) {
    await redis.quit();
    isConnected = false;
  }
});

module.exports = redis;
