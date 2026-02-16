import { tokenBucketLimiter } from "./tokenBucketLimiter.js";
import { ipKeyGenerator } from "express-rate-limit";

export const messageTokenLimiter = tokenBucketLimiter({
  capacity: 5, // max burst
  refillRate: 0.2, // 1 message per second

  keyGenerator: (req) => {
    if (req.session?.user?.user_id) {
      return `tb:message:user:${req.session.user.user_id}`;
    }

    const ipInfo = ipKeyGenerator(req);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `tb:message:ip:${ip}`;
  },
});

export const conversationFetchLimiter = tokenBucketLimiter({
  capacity: 10,
  refillRate: 0.5,
  keyGenerator: (req) => {
    if (req.session?.user?.user_id) {
      return `tb:conversation:user:${req.session.user.user_id}`;
    }

    const ipInfo = ipKeyGenerator(req);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `tb:conversation:ip:${ip}`;
  },
});
