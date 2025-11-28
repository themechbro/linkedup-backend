const express = require("express");
const router = express.Router();
const pool = require("../../db");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

router.post("/signup", async (req, res) => {
  const { email, password, username, full_name } = req.body;
  console.log(email, password, username);

  if (!email || !password || !username || !full_name) {
    return res.status(422).json({
      message: "Enter your Credentials Properly",
      success: false,
    });
  }
  try {
    const existingUser = await pool.query(
      `SELECT * FROM users WHERE email=$1 OR username=$2`,
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "Email or Username Already Exists",
        success: false,
      });
    }

    const user_id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const type = "normal";

    const result = await pool.query(
      `INSERT INTO users(user_id,email, password, created_at, type, username, full_name )
        VALUES($1,$2,$3,NOW(),$4,$5, $6)
        `,
      [user_id, email, hashedPassword, type, username, full_name]
    );

    return res.status(201).json({
      message: "User Created Successfully",
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
