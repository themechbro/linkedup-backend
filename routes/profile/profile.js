const express = require("express");
const router = express.Router();
const pool = require("../../db");
const isAuthenticated = require("../../middleware/sessionChecker");
const profileCache = require("../../redis/profileCacheManager");
const { profileFetchLimiter } = require("../../middleware/profileRateLimiter");

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

router.get(
  "/fetch-profile",
  isAuthenticated,
  profileFetchLimiter,
  async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ success: false, message: "Wrong way" });
    }
    try {
      const cachedProfile = await profileCache.getCachedProfile(user_id);

      if (cachedProfile) {
        return res
          .status(200)
          .json({ success: true, profile: cachedProfile, source: "redis" });
      }

      const microResponse = await fetch(
        `${process.env.SPRING_MICROSERVICE}/api/profile/${user_id}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!microResponse.ok) {
        throw new Error("Profile Fetch service failed");
      }
      const profile = await microResponse.json();

      await profileCache.cacheProfile(user_id, profile);

      return res.status(200).json({ success: true, profile, source: "db" });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  },
);

module.exports = router;
