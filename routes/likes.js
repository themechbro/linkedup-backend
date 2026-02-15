const express = require("express");
const router = express.Router();
const pool = require("../db");
const {
  likeUserLimiter,
  likeIpLimiter,
  likePostLimiter,
} = require("../middleware/rateLimiter");

router.post(
  "/:post_id",
  likeUserLimiter,
  likeIpLimiter,
  likePostLimiter,
  async (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const { post_id } = req.params;
    const userId = user.user_id;

    try {
      // 1️⃣ Check if user already liked the post
      const result = await pool.query(
        "SELECT liked_by FROM posts WHERE id=$1",
        [post_id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Post not found" });
      }

      const likedBy = result.rows[0].liked_by || [];

      let updatedLikes;
      let newLikedBy;

      if (likedBy.includes(userId)) {
        // 2️⃣ Unlike: remove user from array
        newLikedBy = likedBy.filter((id) => id !== userId);
        updatedLikes = newLikedBy.length;
      } else {
        // 3️⃣ Like: add user to array
        newLikedBy = [...likedBy, userId];
        updatedLikes = newLikedBy.length;
      }

      // 4️⃣ Update DB
      await pool.query("UPDATE posts SET liked_by=$1, likes=$2 WHERE id=$3", [
        newLikedBy,
        updatedLikes,
        post_id,
      ]);

      res.json({
        message: likedBy.includes(userId)
          ? "Post unliked successfully"
          : "Post liked successfully",
        liked: !likedBy.includes(userId),
        likes: updatedLikes,
      });
    } catch (err) {
      console.error("Error toggling like:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  },
);

module.exports = router;
