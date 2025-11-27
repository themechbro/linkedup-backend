const express = require("express");
const router = express.Router();
const pool = require("../../db");

router.get("/user_details", async (req, res) => {
  const { user } = req.session;
  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      sessionExists: !!req.session,
      success: false,
    });
  }
  const { user_id } = user;
  const query = `SELECT full_name, headline, profile_picture, cover_pic  FROM users WHERE user_id=$1`;
  const dbReq = await pool.query(query, [user_id]);
  if (dbReq.rowCount == 0) {
    return res
      .status(500)
      .json({ message: "DB issue in fetching", success: false });
  }
  userData = dbReq.rows[0];
  return res.status(200).json({
    meta: {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      type: user.type,
    },
    userData,
  });
});

module.exports = router;
