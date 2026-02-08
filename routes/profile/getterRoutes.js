const express = require("express");
const router = express.Router();
const pool = require("../../db");
const isAuthenticated = require("../../middleware/sessionChecker");

// Fetch About
router.get("/fetch-about", isAuthenticated, async (req, res) => {
  const { profileId } = req.query;

  if (!profileId) {
    return res.status(400).json({ message: "Incomplete", success: false });
  }

  try {
    const result = await pool.query(
      `
        SELECT about FROM users WHERE user_id=$1
        `,
      [profileId],
    );

    return res.status(200).json({
      message: "Fetch success",
      about: result.rows[0].about,
      success: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
});

// Fetch Education
router.get("/fetch-education", isAuthenticated, async (req, res) => {
  const { profileId } = req.query;

  if (!profileId) {
    return res.status(400).json({ message: "Incomplete", success: false });
  }

  try {
    const result = await pool.query(
      `
        SELECT * FROM education WHERE user_id=$1
        `,
      [profileId],
    );

    return res.status(200).json({
      message: "Fetch success",
      education: result.rows,
      success: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
});

// fetch About for brands

router.get("/fetch-about-brands", isAuthenticated, async (req, res) => {
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
});

// fetch posts for brands
router.get("/fetch-posts-brands", isAuthenticated, async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;
  const profileId = req.query.profileId;

  try {
    const response = await pool.query(
      `SELECT *
       FROM posts
       WHERE owner = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [profileId, limit, offset],
    );

    return res.status(200).json({
      posts: response.rows,
      hasMore: response.rows.length === limit, // 🔥 key for infinite scroll
      success: true,
    });
  } catch (error) {
    console.log("fetch-posts-brands error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
});

module.exports = router;
