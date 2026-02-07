const redis = require("./redisClient");
const pool = require("../db/index");

class ProfileCacheManager {
  constructor() {
    this.PROFILE_PREFIX = "profile:";
    this.DEFAULT_TTL = 1800;
    this.EMPTY_TTL = 300;
  }

  getCachekey(profileId) {
    return `${this.PROFILE_PREFIX}${profileId}`;
  }

  async getprofileKey(profileId) {
    try {
      const pattern = `${this.PROFILE_PREFIX}${profileId}:*`;
      const keys = await redis.keys(pattern);
      return keys;
    } catch (error) {
      console.error("Error getting Profile keys:", error);
      return [];
    }
  }

  async cacheProfile(profileId, profileData, ttl = null) {
    const cacheKey = this.getCachekey(profileId);
    const cacheTTL =
      ttl || (profileData.length === 0 ? this.EMPTY_TTL : this.DEFAULT_TTL);

    try {
      await redis.setEx(cacheKey, cacheTTL, JSON.stringify(profileData));
      console.log(`💾 Cached Profile ${profileId}`);
      return true;
    } catch (error) {
      console.error("Error caching profile:", error);
      return false;
    }
  }

  async getCachedProfile(profileId) {
    const cacheKey = this.getCachekey(profileId);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        console.log(`✅ Cache HIT for profile ${profileId} )`);
        return JSON.parse(cached);
      }

      console.log(`❌ Cache MISS for profile ${profileId}`);
      return null;
    } catch (error) {
      console.error("Error getting cached feed:", error);
      return null;
    }
  }

  async invalidateUserProfile(profileId) {
    try {
      const keys = await this.getprofileKey(profileId);

      if (keys.length > 0) {
        await redis.del(keys);
        console.log(
          `🗑️  Invalidated ${keys.length} cache entries for  ${profileId}`,
        );
      }

      return keys.length;
    } catch (error) {
      console.error(`Error invalidating feed for  ${profileId}:`, error);
      return 0;
    }
  }
}

module.exports = new ProfileCacheManager();
