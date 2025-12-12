const express = require("express");
const router = express.Router();
const pool = require("../../db");

router.post("/", async (req, res) => {
  try {
    const sessionUser = req.session.user;

    if (!sessionUser) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Please login first" });
    }

    const userId = sessionUser.user_id;

    const { title, company, location, job_type, description, is_brand } =
      req.body;

    if (!title || !company) {
      return res
        .status(400)
        .json({ message: "Title and company are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO jobs 
        (title, company, location, job_type, description, posted_by, is_brand)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
      `,
      [title, company, location, job_type, description, userId, is_brand]
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

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT j.*, u.full_name AS posted_by_name
      FROM jobs j
      LEFT JOIN users u ON u.id = j.posted_by
      WHERE j.status = 'active'
      ORDER BY j.created_at DESC;
    `);

    return res.status(200).json(result.rows);
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
