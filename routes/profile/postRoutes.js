const express = require("express");
const router = express.Router();
const pool = require("../../db");
const axios = require("axios");
const { apiLimiter } = require("../../middleware/rateLimiter");
const { signInternalJwt } = require("../../utils/internalJwt");

// Education
router.post("/post-education", apiLimiter, async (req, res) => {
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

// About me
router.post("/post-about", apiLimiter, async (req, res) => {
  const { user } = req.session;
  if (!user) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access", success: false });
  }
  const { about } = req.body;
  const { user_id } = user;

  if (typeof about !== "string" || !about.trim()) {
    return res.status(400).json({
      message: "About section is required",
      success: false,
    });
  }

  try {
    const result = await pool.query(
      `
      UPDATE users
      SET about=$1
      WHERE user_id=$2
      RETURNING user_id, about   
      `,
      [about.trim(), user_id]
    );

    return res.status(201).json({
      message: "About successfully added",
      success: true,
      about: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
});

// Industry through Microservice
router.post("/post-industry", apiLimiter, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access", success: false });
  }
  const token = signInternalJwt(user);
  try {
    const response = await axios.post(
      `${process.env.SPRING_MICROSERVICE}/api/profile/update-industry/${user.user_id}`,
      req.body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
});

// Website Through Microservice
router.post("/post-website", apiLimiter, async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access", success: false });
  }
  const token = signInternalJwt(user);
  try {
    const response = await axios.post(
      `${process.env.SPRING_MICROSERVICE}/api/profile/update-website/${user.user_id}`,
      req.body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
});

module.exports = router;
