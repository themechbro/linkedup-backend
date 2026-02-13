const express = require("express");
const pool = require("../../db/index");
const router = express.Router();
const isAuthenticated = require("../../middleware/sessionChecker");
const searchCache = require("../../redis/searchCacheManager");

router.get("/search", isAuthenticated, async (req, res) => {
  const userId = req.currentUser.user_id;
  const q = req.query.q;
  const limit = 10;
  const offset = 0;
  if (!q) {
    return res
      .status(400)
      .json({ users: [], posts: [], message: "No Query found" });
  }

  await searchCache.add(userId, q);

  try {
    const cached = await searchCache.get(q, limit, offset);

    if (cached) {
      console.log("Cache Hit");

      return res.json({ success: true, response: cached });
    }

    console.log("Cache Miss");

    const usersPromise = pool.query(
      `
      SELECT user_id, full_name, username, headline, profile_picture
      FROM users
      WHERE search_vector @@ plainto_tsquery('english', $1)
      LIMIT 10
    `,
      [q],
    );

    const postsPromise = pool.query(
      `
      SELECT id, content, owner, created_at
      FROM posts
      WHERE search_vector @@ plainto_tsquery('english', $1)
      ORDER BY created_at DESC
      LIMIT 10
    `,
      [q],
    );

    const [users, posts] = await Promise.all([usersPromise, postsPromise]);

    const response = {
      users: users.rows,
      posts: posts.rows,
    };

    await searchCache.set(q, limit, offset, response);

    return res.status(200).json({
      success: true,
      response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/recent-searches", isAuthenticated, async (req, res) => {
  const userId = req.currentUser.user_id;

  const searches = await searchCache.getR(userId);

  res.json({
    searches,
  });
});

module.exports = router;
