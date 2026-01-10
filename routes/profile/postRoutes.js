const express = require("express");
const router = express.Router();
const pool = require("../../db");

// Education
router.post("/post-education", async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access", success: false });
  }

  const {
    school_name,
    degree,
    field_of_study,
    start_date,
    end_date,
    grade,
    activities,
    description,
    currently_studying,
  } = req.body;

  if (!school_name || !degree || !field_of_study || !start_date) {
    return res.status(400).json({
      message: "Please fill all required fields",
      success: false,
    });
  }

  if (!currently_studying && !end_date) {
    return res.status(400).json({
      message: "End date is required if you are not currently studying",
      success: false,
    });
  }

  try {
    const response = await pool.query(
      `
      INSERT INTO education (
        user_id,
        school_name,
        degree,
        field_of_study,
        start_date,
        end_date,
        grade,
        activities,
        description,
        currently_studying
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        user.user_id,
        school_name,
        degree,
        field_of_study,
        start_date,
        currently_studying ? null : end_date,
        grade || null,
        activities || null,
        description || null,
        currently_studying,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Education added successfully",
      education: response.rows[0],
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
