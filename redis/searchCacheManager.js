const redis = require("./redisClient");
const pool = require("../db/index");

const SEARCH_CACHE_PREFIX = "search";
const DEFAULT_TTL = 60; // seconds
const RECENT_SEARCH = "user:recent_searches";
const MAX_ITEMS = 10;
const TTL_RECENT_SEARCH = 60 * 60 * 24 * 30; //30 days

function normalizeQuery(query) {
  return query.trim().toLowerCase();
}

function buildKey(query, limit = 10, offset = 0) {
  const normalized = normalizeQuery(query);
  return `${SEARCH_CACHE_PREFIX}:${normalized}:${limit}:${offset}`;
}

/**
 * Get cached search result
 */
async function get(query, limit = 10, offset = 0) {
  try {
    const key = buildKey(query, limit, offset);

    const cached = await redis.get(key);

    if (!cached) return null;

    return JSON.parse(cached);
  } catch (err) {
    console.error("Search cache GET error:", err);
    return null;
  }
}

/**
 * Store search result in cache
 */
async function set(query, limit = 10, offset = 0, data, ttl = DEFAULT_TTL) {
  try {
    const key = buildKey(query, limit, offset);

    await redis.set(key, JSON.stringify(data), "EX", ttl);
  } catch (err) {
    console.error("Search cache SET error:", err);
  }
}

/**
 * Delete specific cached search
 */
async function invalidate(query, limit = 10, offset = 0) {
  try {
    const key = buildKey(query, limit, offset);
    await redis.del(key);
  } catch (err) {
    console.error("Search cache DELETE error:", err);
  }
}

/**
 * Clear all search cache (useful after major updates)
 */
async function invalidateAll() {
  try {
    const keys = await redis.keys(`${SEARCH_CACHE_PREFIX}:*`);

    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (err) {
    console.error("Search cache CLEAR error:", err);
  }
}

// For Recent Search
function getRecentSearchKey(userId) {
  return `${RECENT_SEARCH}:${userId}`;
}

/**
 * Add recent search
 */
async function add(userId, query) {
  try {
    const key = getRecentSearchKey(userId);
    const normalized = query.trim().toLowerCase();

    // remove duplicate
    await redis.lRem(key, 0, normalized);

    // add to front
    await redis.lPush(key, normalized);

    // trim list
    await redis.lTrim(key, 0, MAX_ITEMS - 1);

    // set TTL
    await redis.expire(key, TTL_RECENT_SEARCH);
  } catch (err) {
    console.error("Recent search add error:", err);
  }
}

/**
 * Get recent searches
 */
async function getR(userId) {
  try {
    const key = getRecentSearchKey(userId);

    return await redis.lRange(key, 0, MAX_ITEMS - 1);
  } catch (err) {
    console.error("Recent search get error:", err);
    return [];
  }
}

/**
 * Clear recent searches
 */
async function clear(userId) {
  try {
    const key = getRecentSearchKey(userId);
    await redis.del(key);
  } catch (err) {
    console.error(err);
  }
}

module.exports = {
  get,
  set,
  invalidate,
  invalidateAll,
  getR,
  add,
  clear,
};
