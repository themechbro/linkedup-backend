const express = require("express");
const router = express.Router();
const pool = require("../../db");

// Fetch About
router.get("/fetch-about", async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access", success: false });
  }

  const { profileId } = req.query;

  if (!profileId) {
    return res.status(400).json({ message: "Incomplete", success: false });
  }

  try {
    const result = await pool.query(
      `
        SELECT about FROM users WHERE user_id=$1
        `,
      [profileId]
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

module.exports = router;
