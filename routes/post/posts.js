const express = require("express");
const router = express.Router();
const pool = require("../../db");
const upload = require("../../middleware/upload");
const { v4: uuidv4 } = require("uuid");

// Create Post
router.post("/", upload.array("media", 10), async (req, res) => {
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

// router.get("/", async (req, res) => {
//   try {
//     const currentUser = req.session.user;

//     if (!currentUser) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     // pagination parameters
//     const limit = parseInt(req.query.limit) || 10;
//     const offset = parseInt(req.query.offset) || 0;

//     const result = await pool.query(
//       `
//       SELECT
//         p.*,
//         u.username,
//         u.full_name,
//         u.type,
//         u.profile_picture,
//         COUNT(c.comment_id) AS comment_count
//       FROM posts p
//       JOIN users u ON p.owner = u.user_id
//       LEFT JOIN comments c ON c.post_id = p.id
//       GROUP BY p.id, u.user_id
//       ORDER BY p.created_at DESC
//       LIMIT $1 OFFSET $2;
//       `,
//       [limit, offset]
//     );

//     // mark likes
//     const posts = result.rows.map((post) => ({
//       ...post,
//       liked_by_me: post.liked_by?.includes(currentUser.user_id) || false,
//       current_user: currentUser.user_id,
//     }));

//     res.json(posts);
//   } catch (err) {
//     console.error("Error fetching posts:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// router.get("/", async (req, res) => {
//   try {
//     const currentUser = req.session.user;

//     if (!currentUser) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const limit = parseInt(req.query.limit) || 10;
//     const offset = parseInt(req.query.offset) || 0;

//     // -----------------------------
//     // 1) Fetch main posts as usual
//     // -----------------------------
//     const result = await pool.query(
//       `
//       SELECT
//         p.*,
//         u.username,
//         u.full_name,
//         u.type,
//         u.profile_picture,
//         COUNT(c.comment_id) AS comment_count
//         cr.status AS request_status,
//         cr.sender_id,
//         cr.receiver_id,
//         con.user_id AS connected_user
// FROM posts p
//       JOIN users u ON p.owner = u.user_id
//       LEFT JOIN comments c ON c.post_id = p.id
// LEFT JOIN connection_requests cr
//   ON (cr.sender_id = $3 AND cr.receiver_id = p.owner)
//   OR (cr.sender_id = p.owner AND cr.receiver_id = $3)
// LEFT JOIN connections con
//   ON (con.user_id = $3 AND con.connection_id = p.owner)
//       GROUP BY p.id, u.user_id
//       ORDER BY p.created_at DESC
//       LIMIT $1 OFFSET $2;
//       `,
//       [limit, offset]
//     );

//     const posts = [];

//     // -----------------------------
//     // 2) Loop through posts & attach original post if it's a repost
//     // -----------------------------
//     for (let post of result.rows) {
//       let enriched = {
//         ...post,
//         liked_by_me: post.liked_by?.includes(currentUser.user_id) || false,
//         current_user: currentUser.user_id,
//       };

//       if (post.repost_of) {
//         // Fetch the original post with user details
//         const original = await pool.query(
//           `
//           SELECT
//             p.*,
//             u.username,
//             u.full_name,
//             u.type,
//             u.profile_picture
//           FROM posts p
//           JOIN users u ON p.owner = u.user_id
//           WHERE p.id = $1
//           LIMIT 1;
//           `,
//           [post.repost_of]
//         );

//         enriched.original_post =
//           original.rowCount > 0 ? original.rows[0] : null;
//       }

//       posts.push(enriched);
//     }

//     return res.json(posts);
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

    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    // -----------------------------------------
    // ⭐ MAIN FEED QUERY (Posts + User + Conn)
    // -----------------------------------------

    const result = await pool.query(
      `
  SELECT  
    p.*,
    u.username,
    u.full_name,
    u.type,
    u.profile_picture,
    COUNT(DISTINCT c.comment_id) AS comment_count,

    -- Connection Request Info (use DISTINCT ON or pick one specific record)
    MAX(CASE 
      WHEN (cr.sender_id = $3 AND cr.receiver_id = p.owner AND cr.status = 'pending') 
      THEN 'pending_sent'
      WHEN (cr.sender_id = p.owner AND cr.receiver_id = $3 AND cr.status = 'pending') 
      THEN 'pending_received'
      ELSE NULL 
    END) AS request_status,

    -- Connected Status
    BOOL_OR(con.user_id IS NOT NULL) AS is_connected

  FROM posts p
  JOIN users u 
    ON p.owner = u.user_id

  LEFT JOIN comments c 
    ON c.post_id = p.id

  -- Only join PENDING requests (ignore rejected/accepted)
  LEFT JOIN connection_requests cr 
    ON ((cr.sender_id = $3 AND cr.receiver_id = p.owner)
        OR (cr.sender_id = p.owner AND cr.receiver_id = $3))
    AND cr.status = 'pending'  -- 👈 CRITICAL: Only pending requests

  -- If already connected
  LEFT JOIN connections con
    ON (con.user_id = $3 AND con.connection_id = p.owner)

  GROUP BY p.id, u.user_id  -- 👈 SIMPLIFIED: Only group by post and user
  ORDER BY p.created_at DESC
  LIMIT $1 OFFSET $2
  `,
      [limit, offset, currentUser.user_id]
    );

    //------------------------------------------------------------
    // ⭐ PROCESS POSTS + REPOST LOGIC + CONNECTION STATUS
    //------------------------------------------------------------
    const posts = [];

    for (let post of result.rows) {
      let status = "not_connected";
      const viewer = currentUser.user_id;

      // Already connected
      if (post.is_connected) {
        status = "connected";
      }
      // Check request status
      else if (post.request_status === "pending_sent") {
        status = "pending"; // YOU sent request
      } else if (post.request_status === "pending_received") {
        status = "incoming_request"; // THEY sent request
      }

      let enriched = {
        ...post,
        connection_status: status,
        liked_by_me: post.liked_by?.includes(viewer) || false,
        current_user: viewer,
      };
      // ⭐ If this post is a repost → fetch original post
      if (post.repost_of) {
        const original = await pool.query(
          `
          SELECT  
            p.*,
            u.username,
            u.full_name,
            u.type,
            u.profile_picture
          FROM posts p
          JOIN users u ON p.owner = u.user_id
          WHERE p.id = $1
          LIMIT 1
          `,
          [post.repost_of]
        );

        enriched.original_post =
          original.rowCount > 0 ? original.rows[0] : null;
      }

      posts.push(enriched);
    }

    return res.json(posts);
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

// Repost route
router.post("/:postId/repost", async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: "userId required" });
  }

  try {
    // 1. Fetch original post
    const original = await pool.query("SELECT * FROM posts WHERE id = $1", [
      postId,
    ]);

    if (original.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }
    const originalPost = original.rows[0];

    // 2. Check if already reposted by this user
    const exists = await pool.query(
      "SELECT 1 FROM posts WHERE owner = $1 AND repost_of = $2 LIMIT 1",
      [userId, postId]
    );

    if (exists.rowCount > 0) {
      return res
        .status(400)
        .json({ success: false, message: "Already reposted" });
    }

    // 3. Create a new repost entry
    const repostId = uuidv4();

    await pool.query(
      `INSERT INTO posts (
        id, owner, content, media_url, likes, liked_by, status, repost_of, repost_count, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())`,
      [
        repostId,
        userId,
        null,
        null,
        0,
        [], // liked_by
        "reposted",
        postId,
        0,
      ]
    );

    // 4. Increment repost_count on original post
    await pool.query(
      "UPDATE posts SET repost_count = repost_count + 1 WHERE id = $1",
      [postId]
    );

    return res.json({
      success: true,
      message: "Reposted successfully",
      repost_id: repostId,
    });
  } catch (err) {
    console.error("Repost Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Fetch specific post using postId
// router.get("/getPost", async (req, res) => {
//   const { postId } = req.query;
//   const user = req.session.user;
//   if (!postId)
//     return res.status(400).json({ message: "Bad requesyt", success: false });
//   if (!user)
//     return res.status(401).json({ message: "Unauthorised", success: false });

//   try {
//     const response = await pool.query(`SELECT * FROM posts WHERE id=$1`, [
//       postId,
//     ]);
//     const data = response.rows[0];
//     return res.status(200).json({ data, success: true });
//   } catch (error) {
//     console.log(error);
//     return res
//       .status(500)
//       .json({ message: "Internal Server Error", success: false });
//   }
// });

router.get("/getPost", async (req, res) => {
  const { postId } = req.query;
  const user = req.session.user;

  if (!postId)
    return res.status(400).json({ message: "Bad request", success: false });
  if (!user)
    return res.status(401).json({ message: "Unauthorised", success: false });

  try {
    const query = `
      WITH main_post AS (
        SELECT 
          p.*,
          u.username,
          u.full_name,
          u.profile_picture,
          u.type,
          COUNT(DISTINCT c.comment_id) AS comment_count,
          CASE
            WHEN con.user_id IS NOT NULL THEN 'connected'
            WHEN cr_sent.sender_id IS NOT NULL THEN 'pending'
            WHEN cr_received.sender_id IS NOT NULL THEN 'incoming_request'
            ELSE 'not_connected'
          END AS connection_status
        FROM posts p
        JOIN users u ON p.owner = u.user_id
        LEFT JOIN comments c ON c.post_id = p.id
        LEFT JOIN connections con ON (con.user_id = $2 AND con.connection_id = p.owner)
        LEFT JOIN connection_requests cr_sent 
          ON (cr_sent.sender_id = $2 AND cr_sent.receiver_id = p.owner AND cr_sent.status = 'pending')
        LEFT JOIN connection_requests cr_received 
          ON (cr_received.sender_id = p.owner AND cr_received.receiver_id = $2 AND cr_received.status = 'pending')
        WHERE p.id = $1
        GROUP BY p.id, u.user_id, con.user_id, cr_sent.sender_id, cr_received.sender_id
      ),
      original_post AS (
        SELECT 
          p.*,
          u.username AS orig_username,
          u.full_name AS orig_full_name,
          u.profile_picture AS orig_profile_picture,
          u.type AS orig_type,
          COUNT(DISTINCT c.comment_id) AS orig_comment_count
        FROM main_post mp
        LEFT JOIN posts p ON p.id = mp.repost_of
        LEFT JOIN users u ON p.owner = u.user_id
        LEFT JOIN comments c ON c.post_id = p.id
        WHERE mp.repost_of IS NOT NULL
        GROUP BY p.id, u.user_id
      )
      SELECT 
        mp.*,
        op.id AS original_id,
        op.content AS original_content,
        op.owner AS original_owner,
        op.orig_username,
        op.orig_full_name,
        op.orig_profile_picture,
        op.media_url AS original_media_url,
        op.orig_comment_count,
        op.created_at AS original_created_at
      FROM main_post mp
      LEFT JOIN original_post op ON mp.repost_of = op.id
    `;

    const response = await pool.query(query, [postId, user.user_id]);

    if (response.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    let post = response.rows[0];
    post.current_user = user.user_id;

    // Build original_post object if it's a repost
    if (post.repost_of && post.original_id) {
      post.original_post = {
        id: post.original_id,
        content: post.original_content,
        owner: post.original_owner,
        username: post.orig_username,
        full_name: post.orig_full_name,
        profile_picture: post.orig_profile_picture,
        media_url: post.original_media_url,
        comment_count: post.orig_comment_count,
        created_at: post.original_created_at,
      };

      // Clean up duplicate fields
      delete post.original_id;
      delete post.original_content;
      delete post.original_owner;
      delete post.orig_username;
      delete post.orig_full_name;
      delete post.orig_profile_picture;
      delete post.original_media_url;
      delete post.orig_comment_count;
      delete post.original_created_at;
    }

    return res
      .status(200)
      .json({ data: post, success: true, request_by: user.user_id });
  } catch (error) {
    console.error("Error fetching post:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", success: false });
  }
});

module.exports = router;
