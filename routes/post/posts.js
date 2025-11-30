const express = require("express");
const router = express.Router();
const pool = require("../../db");
const upload = require("../../middleware/upload");

// Create Post
router.post("/", upload.array("media", 5), async (req, res) => {
  try {
    if (!req.session.user || !req.session.user.user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { content } = req.body;
    const owner = req.session.user.user_id;

    const media = req.files.map((file) => {
      const isVideo = file.mimetype.startsWith("video");
      const type = isVideo ? "videos" : "images";

      return {
        url: `/uploads/${type}/${file.filename}`,
        type,
      };
    });

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

router.get("/", async (req, res) => {
  try {
    const currentUser = req.session.user;

    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // pagination parameters
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `
      SELECT  
        p.*,
        u.username,
        u.full_name,
        u.type,
        u.profile_picture,
        COUNT(c.comment_id) AS comment_count
      FROM posts p
      JOIN users u ON p.owner = u.user_id
      LEFT JOIN comments c ON c.post_id = p.id
      GROUP BY p.id, u.user_id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2;
      `,
      [limit, offset]
    );

    // mark likes
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

router.get("/likelist", async (req, res) => {
  try {
    const currentUser = req.session.user;

    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { post_id } = req.query;

    if (!post_id) {
      return res.status(400).json({ message: "post_id is required" });
    }

    const result = await pool.query(
      `
      SELECT 
        u.user_id,
        u.username,
        u.profile_picture
      FROM posts p
      JOIN LATERAL unnest(p.liked_by) AS liked_user_id ON TRUE
      JOIN users u ON u.user_id = liked_user_id
      WHERE p.id = $1;
      `,
      [post_id]
    );

    // Add liked_by_me field
    const likerList = result.rows.map((row) => ({
      ...row,
      liked_by_me: row.user_id === currentUser.user_id,
    }));

    res.json({
      post_id,
      likes_count: likerList.length,
      liked_users: likerList,
    });
  } catch (err) {
    console.error("Error fetching like list:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put(
  "/edit/:post_id",
  upload.array("mediaFiles", 10),
  async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { post_id } = req.params;
      const { content, existingMedia } = req.body;
      const status = "edited";

      // Convert existing media JSON to array
      let existingMediaList = [];
      try {
        if (existingMedia) {
          existingMediaList = JSON.parse(existingMedia);
        }
      } catch (err) {
        console.log("Invalid existing media JSON");
      }

      // 1. Fetch post
      const postQuery = await pool.query("SELECT * FROM posts WHERE id=$1", [
        post_id,
      ]);

      if (postQuery.rows.length === 0) {
        return res.status(404).json({ message: "Post not found" });
      }

      const post = postQuery.rows[0];

      // 2. Ownership check
      if (post.owner !== currentUser.user_id) {
        return res.status(403).json({
          message: "You cannot edit this post",
        });
      }

      // 3. Handle new uploaded files (FIXED: match create endpoint format)
      const newMedia = (req.files || []).map((file) => {
        const isVideo = file.mimetype.startsWith("video");
        const type = isVideo ? "videos" : "images";

        return {
          url: `/uploads/${type}/${file.filename}`, // ✅ Include type in path
          type, // ✅ Include type field
        };
      });

      // 4. Final media list = existing ones + new uploads
      const finalMedia = [...existingMediaList, ...newMedia];

      // 5. Update database
      await pool.query(
        `UPDATE posts 
         SET content=$1, media_url=$2 , status=$3
         WHERE id=$4`,
        [content, JSON.stringify(finalMedia), status, post_id]
      );

      return res.json({
        success: true,
        message: "Post updated successfully",
        media: finalMedia,
      });
    } catch (err) {
      console.error("Error editing post:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

module.exports = router;
