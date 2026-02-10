const express = require("express");
const router = express.Router();
const pool = require("../db");
const upload = require("../middleware/upload");
const { v4: uuid } = require;
const path = require("path");
const fs = require("fs");
const isAuthenticated = require("../middleware/sessionChecker");

const commentImagesPath = path.join(
  __dirname,
  "..",
  "uploads",
  "comment-images",
);
if (!fs.existsSync(commentImagesPath)) {
  fs.mkdirSync(commentImagesPath, { recursive: true });
}

// router.post("/:post_id/comments", upload.single("image"), async (req, res) => {
//   const { post_id } = req.params;
//   const { content, parent_comment_id } = req.body;
//   const { user_id } = req.session.user;
//   let media_url = null;
//   if (!user_id) {
//     return res.status(401).json({ message: "Unauthorized", success: false });
//   }
//   try {
//     if (req.file) {
//       const uploaded = await uploadToS3(req.file, "comment-images");
//       media_url = uploaded.url;
//     }

//     const result = await pool.query(
//       `INSERT INTO comments (post_id, user_id, parent_comment_id, content, media_url)
//        VALUES ($1, $2, $3, $4, $5)
//        RETURNING *`,
//       [post_id, user_id, parent_comment_id, content, media_url]
//     );

//     res.status(201).json({ success: true, comment: result.rows[0] });
//   } catch (err) {
//     console.error("Error posting comment:", err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// router.get("/:post_id/comments", async (req, res) => {
//   const { post_id } = req.params;
//   const { user } = req.session;

//   if (!user) {
//     return res.status(401).json({ message: "Unauthorized", success: false });
//   }

//   try {
//     const result = await pool.query(
//       `
//       SELECT
//         c.comment_id,
//         c.content,
//         c.user_id,
//         c.created_at,
//         c.likes,
//         c.media_url,
//         u.username,
//         u.full_name,
//         u.profile_picture
//       FROM comments c
//       JOIN users u ON c.user_id = u.user_id
//       WHERE c.post_id = $1 AND c.parent_comment_id IS NULL
//       ORDER BY c.created_at DESC;
//       `,
//       [post_id]
//     );

//     res.status(200).json({ success: true, comments: result.rows });
//   } catch (err) {
//     console.error("DB Error:", err);
//     res.status(500).json({ message: "Internal Server Error", success: false });
//   }
// });

router.post("/:post_id/comments", upload.single("image"), async (req, res) => {
  const { post_id } = req.params;
  const { content, parent_comment_id } = req.body;
  const { user_id } = req.session.user;

  if (!user_id) {
    return res.status(401).json({ message: "Unauthorized", success: false });
  }

  try {
    let media_url = null;

    if (req.file) {
      // Move uploaded image to comment-images folder
      const ext = req.file.originalname.split(".").pop();
      const filename = `${Date.now()}-${req.file.originalname}`;
      const finalPath = path.join(commentImagesPath, filename);

      fs.renameSync(req.file.path, finalPath); // move file from temp folder

      media_url = `/uploads/comment-images/${filename}`;
    }

    const result = await pool.query(
      `INSERT INTO comments (post_id, user_id, parent_comment_id, content, media_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [post_id, user_id, parent_comment_id, content, media_url],
    );

    res.status(201).json({ success: true, comment: result.rows[0] });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/:post_id/comments", async (req, res) => {
  const { post_id } = req.params;
  const { user } = req.session;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized", success: false });
  }

  try {
    // Fetch top-level comments
    const topCommentsQuery = `
      SELECT 
        c.comment_id,
        c.content,
        c.user_id,
        c.created_at,
        c.likes,
        c.media_url,
        u.username,
        u.full_name,
        u.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.post_id = $1 AND c.parent_comment_id IS NULL
      ORDER BY c.created_at DESC
    `;
    const topResult = await pool.query(topCommentsQuery, [post_id]);

    // Fetch replies
    const repliesQuery = `
      SELECT 
        c.comment_id,
        c.content,
        c.user_id,
        c.created_at,
        c.likes,
        c.media_url,
        c.parent_comment_id,
        u.username,
        u.full_name,
        u.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.post_id = $1 AND c.parent_comment_id IS NOT NULL
      ORDER BY c.created_at ASC
    `;
    const repliesResult = await pool.query(repliesQuery, [post_id]);

    // Group replies under parent
    const repliesByParent = {};
    repliesResult.rows.forEach((reply) => {
      if (!repliesByParent[reply.parent_comment_id]) {
        repliesByParent[reply.parent_comment_id] = [];
      }
      repliesByParent[reply.parent_comment_id].push(reply);
    });

    // Attach replies to each top-level comment
    const commentsWithReplies = topResult.rows.map((comment) => ({
      ...comment,
      replies: repliesByParent[comment.comment_id] || [],
    }));

    res.status(200).json({
      success: true,
      comments: commentsWithReplies,
    });
  } catch (err) {
    console.error("DB Error (fetch comments):", err);
    res.status(500).json({ message: "Internal Server Error", success: false });
  }
});

router.get("/comment_length", isAuthenticated, async (req, res) => {
  try {
    const { post_id } = req.query;

    const response = await fetch(
      `${process.env.SPRING_MICROSERVICE}/api/comments/${post_id}/length`,
      {
        method: "GET",
      },
    );
    const data = await response.json();
    console.log(data);
    return res.status(200).json({
      length: data,
    });
  } catch (error) {
    console.log(error);
    return req.status(500).json({
      message: "Internal Server Error",
      success: false,
    });
  }
});
module.exports = router;
