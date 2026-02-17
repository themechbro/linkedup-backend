const express = require("express");
const router = express.Router();
const pool = require("../../db");
const isAuthenticated = require("../../middleware/sessionChecker");
const profileCache = require("../../redis/profileCacheManager");
const { profileFetchLimiter } = require("../../middleware/profileRateLimiter");

// Fetch About
router.get(
  "/fetch-about",
  isAuthenticated,
  profileFetchLimiter,
  async (req, res) => {
    const { profileId } = req.query;

    if (!profileId) {
      return res.status(400).json({ message: "Incomplete", success: false });
    }

    try {
      const cachedProfileAbout = await profileCache.getCachedAbout(profileId);
      if (cachedProfileAbout) {
        return res.status(200).json({
          success: true,
          about: cachedProfileAbout,
          source: "redis",
          message: "Fetch Success from cache",
        });
      }

      const result = await pool.query(
        `
        SELECT about FROM users WHERE user_id=$1
        `,
        [profileId],
      );
      const about = result.rows[0].about;
      await profileCache.cacheProfileAbout(profileId, about);
      return res.status(200).json({
        message: "Fetch success",
        about,
        success: true,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Internal Server Error",
        success: false,
      });
    }
  },
);

// Fetch Education
router.get(
  "/fetch-education",
  isAuthenticated,
  profileFetchLimiter,
  async (req, res) => {
    const { profileId } = req.query;

    if (!profileId) {
      return res.status(400).json({ message: "Incomplete", success: false });
    }

    try {
      const cachedProfileEdu = await profileCache.getCachedEdu(profileId);
      if (cachedProfileEdu) {
        return res.status(200).json({
          success: true,
          education: cachedProfileEdu,
          source: "redis",
          message: "Fetch Success from cache",
        });
      }

      const result = await pool.query(
        `
        SELECT * FROM education WHERE user_id=$1
        `,
        [profileId],
      );
      const education = result.rows;
      await profileCache.cacheProfileEdu(profileId, education);
      return res.status(200).json({
        message: "Fetch success",
        education,
        success: true,
        source: "db",
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Internal Server Error",
        success: false,
      });
    }
  },
);

//Fetch Work
router.get(
  "/fetch-work",
  isAuthenticated,
  profileFetchLimiter,
  async (req, res) => {
    const { profileId } = req.query;

    if (!profileId) {
      return res.status(400).json({ message: "Incomplete", success: false });
    }

    try {
      const cachedProfileWork = await profileCache.getCachedWork(profileId);
      if (cachedProfileWork) {
        return res.status(200).json({
          success: true,
          work: cachedProfileWork,
          source: "redis",
          message: "Fetch Success from cache",
        });
      }

      const result = await pool.query(
        `
        SELECT * FROM work WHERE user_id=$1
        `,
        [profileId],
      );
      const work = result.rows;
      await profileCache.cacheProfileWork(profileId, work);

      return res.status(200).json({
        message: "Fetch success",
        work,
        success: true,
        source: "db",
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Internal Server Error",
        success: false,
      });
    }
  },
);

// fetch About for brands

router.get(
  "/fetch-about-brands",
  isAuthenticated,
  profileFetchLimiter,
  async (req, res) => {
    const { profileId } = req.query;
    if (!profileId) {
      return res.status(400).json({
        message: "Profile ID is required",
        success: false,
      });
    }

    try {
      const result = await pool.query(
        `
      SELECT isbrand, about, website, industry, companysize, hq
      FROM users
      WHERE user_id = $1
      `,
        [profileId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message: "Profile not found",
          success: false,
        });
      }

      if (!result.rows[0].isbrand) {
        return res.status(403).json({
          message: "Profile is not a brand",
          success: false,
        });
      }

      const { isbrand, ...aboutData } = result.rows[0];

      return res.status(200).json({
        message: "Fetch success",
        about: aboutData,
        success: true,
      });
    } catch (error) {
      console.error("fetch-about-brands error:", error);
      return res.status(500).json({
        message: "Internal server error",
        success: false,
      });
    }
  },
);

// fetch posts for brands
// router.get(
//   "/fetch-posts-brands",
//   isAuthenticated,
//   profileFetchLimiter,
//   async (req, res) => {
//     const limit = parseInt(req.query.limit) || 10;
//     const offset = parseInt(req.query.offset) || 0;
//     const profileId = req.query.profileId;

//     try {
//       const response = await pool.query(
//         `SELECT *
//        FROM posts
//        WHERE owner = $1
//        ORDER BY created_at DESC
//        LIMIT $2 OFFSET $3`,
//         [profileId, limit, offset],
//       );

// const data= response.rows;

//       return res.status(200).json({
//         posts: response.rows,
//         hasMore: response.rows.length === limit, // 🔥 key for infinite scroll
//         success: true,
//       });
//     } catch (error) {
//       console.log("fetch-posts-brands error:", error);
//       return res.status(500).json({
//         message: "Internal Server Error",
//         success: false,
//       });
//     }
//   },
// );

router.get(
  "/fetch-posts-brands",
  isAuthenticated,
  profileFetchLimiter,
  async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const profileId = req.query.profileId;

    try {
      const response = await pool.query(
        `
        SELECT 
          p.id,
          p.created_at,
          p.content,
          p.media_url,
          p.likes,
          p.owner,
          p.liked_by,
          p.repost_of,
          p.repost_count,
          p.status,

          -- original post fields (if repost)
          rp.id AS repost_id,
          rp.owner AS repost_owner,
          rp.content AS repost_content,
          rp.media_url AS repost_media_url,
          rp.created_at AS repost_created_at,
          rp.likes AS repost_likes,
          rp.liked_by AS repost_liked_by

        FROM posts p

        LEFT JOIN posts rp
        ON p.repost_of = rp.id

        WHERE p.owner = $1

        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3
        `,
        [profileId, limit, offset],
      );

      const posts = response.rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        content: row.content,
        media_url: row.media_url,
        likes: row.likes,
        owner: row.owner,
        liked_by: row.liked_by,
        repost_of: row.repost_of,
        repost_count: row.repost_count,
        status: row.status,

        reposted_post: row.repost_id
          ? {
              id: row.repost_id,
              owner: row.repost_owner,
              content: row.repost_content,
              media_url: row.repost_media_url,
              created_at: row.repost_created_at,
              likes: row.repost_likes,
              liked_by: row.repost_liked_by,
            }
          : null,
      }));

      return res.status(200).json({
        posts,
        hasMore: posts.length === limit,
        success: true,
      });
    } catch (error) {
      console.log("fetch-posts-brands error:", error);
      return res.status(500).json({
        message: "Internal Server Error",
        success: false,
      });
    }
  },
);

module.exports = router;
