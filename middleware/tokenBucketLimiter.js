import redis from "../redis/redisClient.js";

/**
 * Token bucket limiter middleware
 *
 * @param {Object} options
 * @param {number} options.capacity - max tokens
 * @param {number} options.refillRate - tokens per second
 * @param {function} options.keyGenerator - function(req) => key
 */

export function tokenBucketLimiter({ capacity, refillRate, keyGenerator }) {
  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      const now = Date.now();

      const luaScript = `
        local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "last_refill")

local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  last_refill = now
end

local elapsed = (now - last_refill) / 1000
local refill = elapsed * refill_rate

tokens = math.min(capacity, tokens + refill)

if tokens < 1 then

  redis.call("HMSET", key,
    "tokens", tostring(tokens),
    "last_refill", tostring(now)
  )

  redis.call("PEXPIRE", key, 60000)

  return -1

end

tokens = tokens - 1

redis.call("HMSET", key,
  "tokens", tostring(tokens),
  "last_refill", tostring(now)
)

redis.call("PEXPIRE", key, 60000)

return tokens

      `;

      const result = await redis.eval(luaScript, {
        keys: [key],
        arguments: [capacity.toString(), refillRate.toString(), now.toString()],
      });

      if (result === -1) {
        return res.status(429).json({
          success: false,
          message: "Please slow down.",
        });
      }

      next();
    } catch (err) {
      console.error("Token bucket error:", err);

      // fail open (recommended)
      next();
    }
  };
}
