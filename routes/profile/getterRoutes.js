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
    const userId = req.currentUser.user_id;

    try {
      const cachedPost = await profileCache.getCachedBrandPosts(
        profileId,
        limit,
        offset,
      );

      if (cachedPost) {
        return res.status(200).json({
          enrichedPost: cachedPost.enrichedPost,
          hasMore: cachedPost.hasMore,
          success: true,
          source: "cache",
          requestedBy: userId,
        });
      }
      // Fetch from Spring microservice
      const resMicro = await fetch(
        `${process.env.SPRING_MICROSERVICE}/api/feed/fetch-posts-brands?owner=${profileId}&offset=${offset}&limit=${limit}`,
        { method: "GET" },
      );

      if (!resMicro.ok) {
        throw new Error(`Feed microservice error: ${resMicro.status}`);
      }

      const data = await resMicro.json();
      const posts = data.posts || [];

      // Safe JSON parser
      const safeParseMedia = (media) => {
        try {
          return media ? JSON.parse(media) : [];
        } catch {
          return [];
        }
      };

      // Collect all unique user IDs (owner + repost owner)
      const userIdSet = new Set();

      posts.forEach((post) => {
        if (post.owner) userIdSet.add(post.owner);
        if (post.repostedPost?.owner) {
          userIdSet.add(post.repostedPost.owner);
        }
      });

      const userIds = Array.from(userIdSet);

      // Fetch all users in single query
      const usersResult = await pool.query(
        `
        SELECT user_id, username, full_name, type, profile_picture
        FROM users
        WHERE user_id = ANY($1)
        `,
        [userIds],
      );

      // Build lookup map
      const userMap = Object.fromEntries(
        usersResult.rows.map((user) => [user.user_id, user]),
      );

      // Enrich posts
      const enrichedPost = posts.map((post) => {
        const owner = userMap[post.owner];

        // REPOST CASE
        if (post.repostedPost) {
          const originalAuthor = userMap[post.repostedPost.owner];

          return {
            ...post,

            id: post.postId,

            media_url: safeParseMedia(post.mediaUrl),

            username: owner?.username || "",
            full_name: owner?.full_name || "",
            type: owner?.type || "normal",
            profile_picture: owner?.profile_picture || null,

            repostedPost: {
              ...post.repostedPost,

              id: post.repostedPost.post_id,

              media_url: safeParseMedia(post.repostedPost.mediaUrl),

              username: originalAuthor?.username || "",

              full_name: originalAuthor?.full_name || "",

              type: originalAuthor?.type || "normal",

              profile_picture: originalAuthor?.profile_picture || null,

              liked_by: post.repostedPost.likedBy || [],

              liked_by_me: post.repostedPost.likedBy?.includes(userId) || false,
            },

            liked_by: post.likedBy || [],

            liked_by_me: post.likedBy?.includes(userId) || false,

            current_user: userId,

            connection_status: "connected",
          };
        }

        // NORMAL POST CASE
        return {
          ...post,

          id: post.postId,

          media_url: safeParseMedia(post.mediaUrl),

          username: owner?.username || "",
          full_name: owner?.full_name || "",
          type: owner?.type || "normal",
          profile_picture: owner?.profile_picture || null,

          liked_by: post.likedBy || [],

          liked_by_me: post.likedBy?.includes(userId) || false,

          current_user: userId,

          connection_status: "connected",
        };
      });
      const hasMore = data.hasMore;
      await profileCache.cacheBrandPosts(
        profileId,
        limit,
        offset,
        enrichedPost,
        hasMore,
      );
      return res.status(200).json({
        enrichedPost,
        hasMore,
        success: true,
        source: "db",
        requestedBy: userId,
      });
    } catch (error) {
      console.error("fetch-posts-brands error:", error);

      return res.status(500).json({
        message: "Internal Server Error",
        success: false,
      });
    }
  },
);

// Fetch brand jobs
router.get(
  "/fetch_brand_jobs_3",
  isAuthenticated,
  profileFetchLimiter,
  async (req, res) => {
    const userId = req.currentUser.user_id;
    const profileId = req.query.profileId;

    try {
      const resMicro = await fetch(
        `${process.env.SPRING_MICROSERVICE}/api/jobs_micro/get_jobs_for_brand_page/${profileId}`,
        {
          method: "GET",
        },
      );

      const data = await resMicro.json();
      return res.status(200).json({
        jobs: data,
        success: true,
        requestedBy: userId,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        message: "Internal Server Error",
        success: false,
      });
    }
  },
);

module.exports = router;
