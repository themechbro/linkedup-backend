import { tokenBucketLimiter } from "./tokenBucketLimiter.js";
import { ipKeyGenerator } from "express-rate-limit";

export const profileFetchLimiter = tokenBucketLimiter({
  capacity: 15,
  refillRate: 0.5,
  keyGenerator: (req) => {
    if (req.session?.user?.user_id) {
      return `tb:profile:user:${req.session.user.user_id}`;
    }

    const ipInfo = ipKeyGenerator(req);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `tb:profile:ip:${ip}`;
  },
});
