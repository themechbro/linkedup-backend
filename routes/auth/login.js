const express = require("express");
const router = express.Router();
const pool = require("../../db");
const bcrypt = require("bcryptjs");
const { loginLimiter } = require("../../middleware/rateLimiter");

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(422).json({
      message: "Enter your Credentials Properly",
      success: false,
    });
  }

  try {
    const userResult = await pool.query(
      `SELECT * FROM users WHERE username=$1`,
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid Credentials",
        success: false,
      });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid Credentials",
        success: false,
      });
    }

    req.session.user = {
      user_id: user.user_id,
      email: user.email,
      username: user.username,
    };
    return res.json({
      message: "Login successful",
      user: req.session.user,
      success: true,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
});

module.exports = router;
