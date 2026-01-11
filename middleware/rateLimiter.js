import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, //10 Minutes
  max: 5,
  message: {
    message: "Too many login attempts. Please try again later.",
    success: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
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
