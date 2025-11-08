const express = require("express");
const router = express.Router();
const pool = require("../db");
const { upload, uploadToS3 } = require("../middleware/upload");

// Create Post
router.post("/", upload.array("media", 5), async (req, res) => {
  try {
    if (!req.session.user || !req.session.user.user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { content } = req.body;
    const owner = req.session.user.user_id;

    // Upload each file to S3 and collect URLs
    const media = [];
    for (const file of req.files) {
      const folder = file.mimetype.startsWith("video") ? "videos" : "images";
      const uploaded = await uploadToS3(file, folder);
      media.push({ ...uploaded, type: folder });
    }

    const result = await pool.query(
      `INSERT INTO posts (content, media_url, likes, status, owner, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [content, JSON.stringify(media), 0, "created", owner]
    );

    res.status(201).json({
      message: "Post created successfully",
      post: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating post:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// router.get("/", async (req, res) => {
//   try {
//     const result = await pool.query(`
//       SELECT p.*, u.username, u.full_name, u.type
//       FROM posts p
//       JOIN users u ON p.owner = u.user_id
//       ORDER BY p.created_at DESC
//     `);

//     res.json(result.rows);
//   } catch (err) {
//     console.error("Error fetching posts:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

router.get("/", async (req, res) => {
  try {
    const currentUser = req.session.user;

    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Fetch posts with author info
    const result = await pool.query(`
      SELECT 
        p.*,
        u.username,
        u.full_name,
        u.type
      FROM posts p
      JOIN users u ON p.owner = u.user_id
      ORDER BY p.created_at DESC
    `);

    // Mark whether current user liked each post
    const posts = result.rows.map((post) => ({
      ...post,
      liked_by_me: post.liked_by?.includes(currentUser.user_id) || false,
      current_user: currentUser.user_id,
    }));

    res.json(posts);
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;

module.exports = router;
