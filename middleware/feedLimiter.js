import { tokenBucketLimiter } from "./tokenBucketLimiter.js";
import { ipKeyGenerator } from "express-rate-limit";

export const feedFetchLimiter = tokenBucketLimiter({
  capacity: 10,

  refillRate: 0.5,

  keyGenerator: (req) => {
    if (req.session?.user?.user_id) {
      return `tb:feed:user:${req.session.user.user_id}`;
    }

    const ipInfo = ipKeyGenerator(req);
    const ip = typeof ipInfo === "string" ? ipInfo : ipInfo.ip;

    return `tb:feed:ip:${ip}`;
  },
});
