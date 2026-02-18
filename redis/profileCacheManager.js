const redis = require("./redisClient");
const pool = require("../db/index");

class ProfileCacheManager {
  constructor() {
    this.PROFILE_PREFIX = "profile:";
    this.DEFAULT_TTL = 1800;
    this.EMPTY_TTL = 300;
    this.PROFILE_ABOUT = "profile:about:";
    this.PROFILE_EDU = "profile:edu:";
    this.PROFILE_WORK = "profile:work:";
    this.BRAND_POST = "profile:brand:posts:";
  }

  getCachekey(profileId) {
    return `${this.PROFILE_PREFIX}${profileId}`;
  }

  getCachekeyAbout(profileId) {
    return `${this.PROFILE_ABOUT}${profileId}`;
  }
  getCachekeyEdu(profileId) {
    return `${this.PROFILE_EDU}${profileId}`;
  }
  getCachekeyWork(profileId) {
    return `${this.PROFILE_WORK}${profileId}`;
  }

  getCachekeyBrandPosts(profileId, limit, offset) {
    return `${this.BRAND_POST}${profileId}:${limit}:${offset}`;
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
  // Profile
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

  // About
  async cacheProfileAbout(profileId, about, ttl = null) {
    const key = this.getCachekeyAbout(profileId);
    const cacheTTL =
      ttl || (about.length === 0 ? this.EMPTY_TTL : this.DEFAULT_TTL);

    try {
      await redis.setEx(key, cacheTTL, JSON.stringify(about));
      console.log(`💾 Cached Profile About ${profileId}`);
      return true;
    } catch (error) {
      console.error("Error caching About for profile:", error);
      return false;
    }
  }
  // Education
  async cacheProfileEdu(profileId, edu, ttl = null) {
    const key = this.getCachekeyEdu(profileId);
    const cacheTTL =
      ttl || (edu.length === 0 ? this.EMPTY_TTL : this.DEFAULT_TTL);

    try {
      await redis.setEx(key, cacheTTL, JSON.stringify(edu));
      console.log(`💾 Cached Profile Education ${profileId}`);
      return true;
    } catch (error) {
      console.error("Error caching Education for profile:", error);
      return false;
    }
  }
  // Work
  async cacheProfileWork(profileId, work, ttl = null) {
    const key = this.getCachekeyWork(profileId);
    const cacheTTL =
      ttl || (work.length === 0 ? this.EMPTY_TTL : this.DEFAULT_TTL);

    try {
      await redis.setEx(key, cacheTTL, JSON.stringify(work));
      console.log(`💾 Cached Profile Work ${profileId}`);
      return true;
    } catch (error) {
      console.error("Error caching Work for profile:", error);
      return false;
    }
  }

  // Brand Posts
  async cacheBrandPosts(
    profileId,
    limit,
    offset,
    postData,
    hasMore,
    ttl = null,
  ) {
    const cacheKey = this.getCachekeyBrandPosts(profileId, limit, offset);
    const cacheTTL =
      ttl || (postData.length === 0 ? this.EMPTY_FEED_TTL : this.DEFAULT_TTL);

    try {
      await redis.setEx(
        cacheKey,
        cacheTTL,
        JSON.stringify({
          enrichedPost: postData,
          hasMore,
        }),
      );
      console.log(
        `💾 Cached post for brand ${profileId} (limit:${limit}, offset:${offset}, TTL:${cacheTTL}s)`,
      );
      return true;
    } catch (error) {
      console.error("Error caching feed:", error);
      return false;
    }
  }

  // Getters
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

  async getCachedAbout(profileId) {
    const cacheKey = this.getCachekeyAbout(profileId);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        console.log(`✅ Cache HIT for profile ${profileId} for About )`);
        return JSON.parse(cached);
      }

      console.log(`❌ Cache MISS for profile ${profileId} for About`);
      return null;
    } catch (error) {
      console.error("Error getting cached feed:", error);
      return null;
    }
  }

  async getCachedEdu(profileId) {
    const cacheKey = this.getCachekeyEdu(profileId);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        console.log(`✅ Cache HIT for profile ${profileId} for Education`);
        return JSON.parse(cached);
      }

      console.log(`❌ Cache MISS for profile ${profileId} for Education`);
      return null;
    } catch (error) {
      console.error("Error getting cached feed:", error);
      return null;
    }
  }

  async getCachedWork(profileId) {
    const cacheKey = this.getCachekeyWork(profileId);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        console.log(`✅ Cache HIT for profile ${profileId} for Work`);
        return JSON.parse(cached);
      }

      console.log(`❌ Cache MISS for profile ${profileId} for Work`);
      return null;
    } catch (error) {
      console.error("Error getting cached feed:", error);
      return null;
    }
  }

  async getCachedBrandPosts(profileId, limit, offset) {
    const cacheKey = this.getCachekeyBrandPosts(profileId, limit, offset);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        console.log(
          `✅ Cache HIT for posts for brand  ${profileId} (limit:${limit}, offset:${offset})`,
        );
        return JSON.parse(cached);
      }

      console.log(`❌ Cache MISS for brand posts ${profileId}`);
      return null;
    } catch (error) {
      console.error("Error getting cached feed:", error);
      return null;
    }
  }

  // Invalidate
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
