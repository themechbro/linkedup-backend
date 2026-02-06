const redis = require("./redisClient");
const pool = require("../db/index");

class JobCacheManager {
  constructor() {
    this.JOB_PREFIX = "jobs:";
    this.DEFAULT_TTL = 900; //15Minutes
    this.EMPTY_JOB_TTL = 300; // 5minutes
  }

  getCacheKey(userId, limit, offset) {
    return `${this.JOB_PREFIX}${userId}:${limit}:${offset}`;
  }

  async getUserJobKeys(userId) {
    try {
      const pattern = `${this.JOB_PREFIX}${userId}:*`;
      const keys = await redis.keys(pattern);
      return keys;
    } catch (error) {
      console.error("Error getting user Job keys:", error);
      return [];
    }
  }

  async cacheJob(userId, limit, offset, jobData, ttl = null) {
    const cacheKey = this.getCacheKey(userId, limit, offset);
    const cacheTTL =
      ttl ||
      (jobData.jobs.length === 0 ? this.EMPTY_JOB_TTL : this.DEFAULT_TTL);

    try {
      await redis.setEx(cacheKey, cacheTTL, JSON.stringify(jobData));
      console.log(
        `💾 Cached Jobs for user ${userId} (limit:${limit}, offset:${offset}, TTL:${cacheTTL}s)`,
      );
      return true;
    } catch (error) {
      console.error("Error caching feed:", error);
      return false;
    }
  }

  async getCachedJob(userId, limit, offset) {
    const cacheKey = this.getCacheKey(userId, limit, offset);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        console.log(
          `✅ Cache HIT for user ${userId} (limit:${limit}, offset:${offset})`,
        );
        return JSON.parse(cached);
      }

      console.log(`❌ Cache MISS for user ${userId}`);
      return null;
    } catch (error) {
      console.error("Error getting cached feed:", error);
      return null;
    }
  }

  async invalidateUserJob(userId) {
    try {
      const keys = await this.getUserFeedKeys(userId);

      if (keys.length > 0) {
        await redis.del(keys);
        console.log(
          `🗑️  Invalidated ${keys.length} cache entries for user ${userId}`,
        );
      }

      return keys.length;
    } catch (error) {
      console.error(`Error invalidating feed for user ${userId}:`, error);
      return 0;
    }
  }

  async clearAllJobs() {
    try {
      const pattern = `${this.JOB_PREFIX}*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(keys);
        console.log(`🧹 Cleared all ${keys.length} job cache entries`);
      }

      return keys.length;
    } catch (error) {
      console.error("Error clearing all Jobs:", error);
      return 0;
    }
  }

  async getCacheStats() {
    try {
      const pattern = `${this.JOB_PREFIX}*`;
      const keys = await redis.keys(pattern);

      // Group by user
      const userStats = {};

      keys.forEach((key) => {
        const match = key.match(/jobs:(\d+):/);
        if (match) {
          const userId = match[1];
          userStats[userId] = (userStats[userId] || 0) + 1;
        }
      });

      return {
        totalCachedJobs: keys.length,
        uniqueUsers: Object.keys(userStats).length,
        userStats,
      };
    } catch (error) {
      console.error("Error getting cache stats:", error);
      return null;
    }
  }
}

module.exports = new JobCacheManager();
