const redis = require("./redisClient");
const pool = require("../db/index");
/**
 * Feed Cache Manager
 * Handles caching and invalidation strategies for connection feeds
 */
class FeedCacheManager {
  constructor() {
    this.FEED_PREFIX = "feed:connections:";
    this.DEFAULT_TTL = 900; // 15 minutes
    this.EMPTY_FEED_TTL = 300; // 5 minutes for empty feeds
  }

  /**
   * Generate cache key for a user's feed
   */
  getCacheKey(userId, limit, offset) {
    return `${this.FEED_PREFIX}${userId}:${limit}:${offset}`;
  }

  /**
   * Get all cache keys for a specific user (all pagination variants)
   */
  async getUserFeedKeys(userId) {
    try {
      const pattern = `${this.FEED_PREFIX}${userId}:*`;
      const keys = await redis.keys(pattern);
      return keys;
    } catch (error) {
      console.error("Error getting user feed keys:", error);
      return [];
    }
  }

  /**
   * Cache feed data
   */
  async cacheFeed(userId, limit, offset, feedData, ttl = null) {
    const cacheKey = this.getCacheKey(userId, limit, offset);
    const cacheTTL =
      ttl ||
      (feedData.feed.length === 0 ? this.EMPTY_FEED_TTL : this.DEFAULT_TTL);

    try {
      await redis.setEx(cacheKey, cacheTTL, JSON.stringify(feedData));
      console.log(
        `💾 Cached feed for user ${userId} (limit:${limit}, offset:${offset}, TTL:${cacheTTL}s)`,
      );
      return true;
    } catch (error) {
      console.error("Error caching feed:", error);
      return false;
    }
  }

  /**
   * Get cached feed
   */
  async getCachedFeed(userId, limit, offset) {
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

  /**
   * Invalidate all feed cache entries for a specific user
   */
  async invalidateUserFeed(userId) {
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

  /**
   * Invalidate feed cache for all connections of a user
   * Call this when a user creates, edits, or deletes a post
   */
  async invalidateConnectionFeeds(postOwnerId) {
    try {
      // Get all users who have this person as a connection
      const result = await pool.query(
        `SELECT user_id FROM connections WHERE connection_id = $1`,
        [postOwnerId],
      );

      if (result.rows.length === 0) {
        console.log(`No connections found for user ${postOwnerId}`);
        return 0;
      }

      // Invalidate cache for all connected users
      const invalidationPromises = result.rows.map((row) =>
        this.invalidateUserFeed(row.user_id),
      );

      const results = await Promise.all(invalidationPromises);
      const totalInvalidated = results.reduce((sum, count) => sum + count, 0);

      console.log(
        `🔄 Invalidated ${totalInvalidated} cache entries for ${result.rows.length} connections`,
      );

      return totalInvalidated;
    } catch (error) {
      console.error("Error invalidating connection feeds:", error);
      return 0;
    }
  }

  /**
   * Invalidate feed when a new connection is made
   * Both users need their feeds refreshed
   */
  async invalidateOnNewConnection(userId1, userId2) {
    try {
      await Promise.all([
        this.invalidateUserFeed(userId1),
        this.invalidateUserFeed(userId2),
      ]);

      console.log(
        `🔗 Invalidated feeds for new connection: ${userId1} <-> ${userId2}`,
      );
      return true;
    } catch (error) {
      console.error("Error invalidating feeds on new connection:", error);
      return false;
    }
  }

  /**
   * Invalidate feed when a connection is removed
   */
  async invalidateOnConnectionRemoved(userId1, userId2) {
    try {
      await Promise.all([
        this.invalidateUserFeed(userId1),
        this.invalidateUserFeed(userId2),
      ]);

      console.log(
        `💔 Invalidated feeds for removed connection: ${userId1} <-> ${userId2}`,
      );
      return true;
    } catch (error) {
      console.error("Error invalidating feeds on connection removal:", error);
      return false;
    }
  }

  /**
   * Manually clear all feed caches (use sparingly, for admin purposes)
   */
  async clearAllFeeds() {
    try {
      const pattern = `${this.FEED_PREFIX}*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(keys);
        console.log(`🧹 Cleared all ${keys.length} feed cache entries`);
      }

      return keys.length;
    } catch (error) {
      console.error("Error clearing all feeds:", error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      const pattern = `${this.FEED_PREFIX}*`;
      const keys = await redis.keys(pattern);

      // Group by user
      const userStats = {};

      keys.forEach((key) => {
        const match = key.match(/feed:connections:(\d+):/);
        if (match) {
          const userId = match[1];
          userStats[userId] = (userStats[userId] || 0) + 1;
        }
      });

      return {
        totalCachedFeeds: keys.length,
        uniqueUsers: Object.keys(userStats).length,
        userStats,
      };
    } catch (error) {
      console.error("Error getting cache stats:", error);
      return null;
    }
  }
}

module.exports = new FeedCacheManager();
