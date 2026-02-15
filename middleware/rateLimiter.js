// const rateLimit = require("express-rate-limit");
// const { RedisStore } = require("rate-limit-redis");
// const redis = require("../redis/redisClient");
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redis from "../redis/redisClient.js";

export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,

  skipSuccessfulRequests: true,

  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    const { ip } = ipKeyGenerator(req, res);
    return `login:ip:${ip}`;
  },
});

export const loginUserLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,

  skipSuccessfulRequests: true,

  message: {
    success: false,
    message: "Too many login attempts for this account.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req) => {
    const username = (req.body.username || "unknown")
      .toString()
      .toLowerCase()
      .trim();

    return `login:user:${username}`;
  },
});

export const logoutLimitter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: {
    message: "Too many logout requests. Please slow down.",
    success: false,
  },
  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    // Primary protection: per logged-in user
    if (req.session?.user?.user_id) {
      return `logout:user:${req.session.user.user_id}`;
    }
    // Fallback protection: IPv6-safe IP key
    const ipInfo = ipKeyGenerator(req, res);
    // ipKeyGenerator returns object in v7+
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `logout:ip:${ip}`;
  },
});

export const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes

  max: 5, // only 5 accounts per 15 minutes per IP

  message: {
    success: false,
    message: "Too many signup attempts. Please try again later.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;
    return `signup:ip:${ip}`;
  },
});

export const signupUserLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour

  max: 3,

  message: {
    success: false,
    message: "Too many attempts for this username.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req) => {
    const username = (req.body.username || "unknown").toLowerCase().trim();

    return `signup:user:${username}`;
  },
});

export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: {
    message: "Too many attempts. Please Slow down.",
    success: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Post Limiter
export const postIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,

  message: {
    success: false,
    message: "Too many request from this newtwork.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `post:ip:${ip}`;
  },
});

export const postUserLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute

  max: 5,

  message: {
    success: false,
    message: "You're posting too fast. Please slow down.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    if (req.session?.user?.user_id) {
      return `post:user:${req.session.user.user_id}`;
    }

    // fallback if session missing
    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `post:ip:${ip}`;
  },
});

// Comment Limiters
export const commentUserLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute

  max: 15, // allow more than posts

  message: {
    success: false,
    message: "You're commenting too fast. Please slow down.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    if (req.session?.user?.user_id) {
      return `comment:user:${req.session.user.user_id}`;
    }

    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `comment:ip:${ip}`;
  },
});

export const commentIpLimiter = rateLimit({
  windowMs: 60 * 1000,

  max: 50,

  message: {
    success: false,
    message: "Too many comments from this network.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `comment:ip:${ip}`;
  },
});

// Post Like Limiter
export const likeUserLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute

  max: 60, // allow 60 likes/unlikes per minute

  message: {
    success: false,
    message: "Stop Spamming likes.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    if (req.session?.user?.user_id) {
      return `like:user:${req.session.user.user_id}`;
    }

    // fallback protection
    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `like:ip:${ip}`;
  },
});

export const likeIpLimiter = rateLimit({
  windowMs: 60 * 1000,

  max: 20,

  message: {
    success: false,
    message: "Too many like requests from this network.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `like:ip:${ip}`;
  },
});

// Per Post
export const likePostLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute

  max: 5, // max 5 toggles per post per minute

  message: {
    success: false,
    message: "You are spamming a lot on this post. Stop it!!",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    const postId = req.params.post_id;

    if (req.session?.user?.user_id) {
      return `like:user:${req.session.user.user_id}:post:${postId}`;
    }

    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `like:ip:${ip}:post:${postId}`;
  },
});

export const searchUserLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute

  max: 30,

  message: {
    success: false,
    message: "Too many search requests. Please slow down.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    if (req.session?.user?.user_id) {
      return `search:user:${req.session.user.user_id}`;
    }

    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `search:ip:${ip}`;
  },
});

export const searchIpLimiter = rateLimit({
  windowMs: 60 * 1000,

  max: 60,

  message: {
    success: false,
    message: "Too many search requests from this network.",
  },

  standardHeaders: true,
  legacyHeaders: false,

  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),

  keyGenerator: (req, res) => {
    const ipInfo = ipKeyGenerator(req, res);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `search:ip:${ip}`;
  },
});
