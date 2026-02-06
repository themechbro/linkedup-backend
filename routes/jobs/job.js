const express = require("express");
const router = express.Router();
const pool = require("../../db");
const jobCache = require("../../redis/jobCacheManager");
const isAuthenticated = require("../../middleware/sessionChecker");

router.post("/", async (req, res) => {
  try {
    const sessionUser = req.session.user;

    if (!sessionUser) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Please login first" });
    }

    const userId = sessionUser.user_id;

    const {
      title,
      company,
      location,
      job_type,
      description,
      is_brand,
      applyLink,
    } = req.body;

    if (!title || !company) {
      return res
        .status(400)
        .json({ message: "Title and company are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO jobs 
        (title, company, location, job_type, description, posted_by, is_brand, applylink)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
      `,
      [
        title,
        company,
        location,
        job_type,
        description,
        userId,
        is_brand,
        applyLink,
      ],
    );

    return res.status(201).json({
      message: "Job posted successfully",
      job: result.rows[0],
    });
  } catch (error) {
    console.error("Error posting job:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /jobs
 * Fetch all active jobs
 */

// router.get("/", async (req, res) => {
//   try {
//     const result = await pool.query(`
//       SELECT j.*, u.full_name AS posted_by_name, u.profile_picture as posted_by_pic
//       FROM jobs j
//       LEFT JOIN users u ON u.user_id = j.posted_by
//       WHERE j.status = 'active'
//       ORDER BY j.created_at DESC;
//     `);

//     return res.status(200).json(result.rows);
//   } catch (error) {
//     console.error("Error fetching jobs:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// });

router.get("/", isAuthenticated, async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.currentUser.user_id;
  try {
    const cachedJob = await jobCache.getCachedJob(userId, limit, offset);

    if (cachedJob) {
      return res.status(200).json(cachedJob);
    }

    const result = await pool.query(
      `
      SELECT j.*, u.full_name AS posted_by_name, u.profile_picture as posted_by_pic
      FROM jobs j
      LEFT JOIN users u ON u.user_id = j.posted_by
      WHERE j.status = 'active'
      ORDER BY j.created_at DESC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    );
    const response = {
      success: true,
      jobs: result.rows,
      count: result.rows.length,
    };

    // cache jobs
    await jobCache.cacheJob(userId, limit, offset, response);
    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
/**
 * GET /jobs/:id
 * Fetch single job by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Job not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching job:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
