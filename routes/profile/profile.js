const express = require("express");
const router = express.Router();
const pool = require("../../db");

router.get("/view-profile", async (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.status(401).json({ message: "Unauthorised", success: false });
  }
  const { username } = req.query;
  if (!username) {
    return res
      .status(403)
      .json({ message: "No username found", success: false });
  }
  const query = `SELECT username, email, full_name, headline, profile_picture, cover_pic FROM users WHERE username=$1`;

  try {
    const response = await pool.query(query, [user.username]);
    const data = await response.rows();
    return res.status(200).json({ userData: data, success: true });
  } catch (err) {
    console.log(err);
  }
});
