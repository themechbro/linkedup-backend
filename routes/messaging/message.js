const express = require("express");
const router = express.Router();
const pool = require("../../db");

router.get("/all-conversation", async (req, res) => {
  try {
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    const query = `
      SELECT 
        c.conversation_id,
        c.last_message_at,
        
        -- Other user info
        CASE 
          WHEN c.user1_id = $1 THEN u2.user_id
          ELSE u1.user_id
        END AS other_user_id,
        
        CASE 
          WHEN c.user1_id = $1 THEN u2.full_name
          ELSE u1.full_name
        END AS other_user_name,
        
        CASE 
          WHEN c.user1_id = $1 THEN u2.username
          ELSE u1.username
        END AS other_username,
        
        CASE 
          WHEN c.user1_id = $1 THEN u2.profile_picture
          ELSE u1.profile_picture
        END AS other_user_picture,
        
        -- Last message info
        m.content AS last_message,
        m.sender_id AS last_sender_id,
        m.read AS last_message_read,
        
        -- Unread count
        (
          SELECT COUNT(*)
          FROM messages
          WHERE receiver_id = $1
            AND sender_id = CASE 
              WHEN c.user1_id = $1 THEN c.user2_id 
              ELSE c.user1_id 
            END
            AND read = FALSE
        ) AS unread_count
        
      FROM conversations c
      JOIN users u1 ON c.user1_id = u1.user_id
      JOIN users u2 ON c.user2_id = u2.user_id
      LEFT JOIN messages m ON c.last_message_id = m.message_id
      
      WHERE c.user1_id = $1 OR c.user2_id = $1
      
      ORDER BY c.last_message_at DESC
    `;

    const result = await pool.query(query, [currentUser.user_id]);

    return res.status(200).json({
      success: true,
      conversations: result.rows,
    });
  } catch (err) {
    console.error("Error fetching conversations:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", success: false });
  }
});

// Send a new message
// router.post("/send_new_message", async (req, res) => {
//   try {
//     const currentUser = req.session.user;
//     if (!currentUser) {
//       return res.status(401).json({ message: "Unauthorized", success: false });
//     }

//     const { receiver_id, content } = await req.json();

//     if (!receiver_id || !content || content.trim() === "") {
//       return res
//         .status(400)
//         .json({ message: "Receiver and content are required", success: false });
//     }

//     // Check if users are connected
//     const connectionCheck = await pool.query(
//       `SELECT * FROM connections
//        WHERE user_id = $1 AND connection_id = $2`,
//       [currentUser.user_id, receiver_id]
//     );

//     if (connectionCheck.rows.length === 0) {
//       return res.status(403).json({
//         message: "You can only message your connections",
//         success: false,
//       });
//     }

//     // Insert message
//     const result = await pool.query(
//       `INSERT INTO messages (sender_id, receiver_id, content)
//        VALUES ($1, $2, $3)
//        RETURNING *`,
//       [currentUser.user_id, receiver_id, content.trim()]
//     );
//     return res.status(200).json({ message: result.rows[0], success: true });
//   } catch (err) {
//     console.error("Error sending message:", err);
//     return res
//       .status(500)
//       .json({ message: "Internal server error", success: false });
//   }
// });

// // Get Messages for Specific Conversation
// router.get("/get-coversation-specific/:userId", async (req, res) => {
//   try {
//     const currentUser = req.session.user;
//     if (!currentUser) {
//       return res.status(401).json({ message: "Unauthorized", success: false });
//     }

//     const { userId } = req.params;
//     const { searchParams } = new URL(req.url);
//     const limit = parseInt(searchParams.get("limit")) || 50;
//     const offset = parseInt(searchParams.get("offset")) || 0;

//     // Check if connected
//     const connectionCheck = await pool.query(
//       `SELECT * FROM connections
//        WHERE user_id = $1 AND connection_id = $2`,
//       [currentUser.user_id, userId]
//     );

//     if (connectionCheck.rows.length === 0) {
//       return res
//         .status(403)
//         .json({ message: "Not connected with this user", success: false });
//     }

//     // Fetch messages
//     const query = `
//       SELECT
//         m.*,
//         u.full_name AS sender_name,
//         u.username AS sender_username,
//         u.profile_picture AS sender_picture
//       FROM messages m
//       JOIN users u ON m.sender_id = u.user_id
//       WHERE
//         (m.sender_id = $1 AND m.receiver_id = $2)
//         OR (m.sender_id = $2 AND m.receiver_id = $1)
//       ORDER BY m.created_at DESC
//       LIMIT $3 OFFSET $4
//     `;

//     const result = await pool.query(query, [
//       currentUser.user_id,
//       userId,
//       limit,
//       offset,
//     ]);

//     // Mark messages as read
//     await pool.query(
//       `UPDATE messages
//        SET read = TRUE
//        WHERE receiver_id = $1 AND sender_id = $2 AND read = FALSE`,
//       [currentUser.user_id, userId]
//     );

//     return res.status(200).json({
//       success: true,
//       messages: result.rows.reverse(),
//     });
//   } catch (err) {
//     console.error("Error fetching messages:", err);
//     return res
//       .status(500)
//       .json({ message: "Internal server error", success: false });
//   }
// });

// Send a new message - FIXED
router.post("/send_new_message", async (req, res) => {
  try {
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    const { receiver_id, content } = req.body; // ✅ FIXED

    if (!receiver_id || !content || content.trim() === "") {
      return res.status(400).json({
        message: "Receiver and content are required",
        success: false,
      });
    }

    // Check if users are connected
    const connectionCheck = await pool.query(
      `SELECT * FROM connections 
       WHERE user_id = $1 AND connection_id = $2`,
      [currentUser.user_id, receiver_id]
    );

    if (connectionCheck.rows.length === 0) {
      return res.status(403).json({
        message: "You can only message your connections",
        success: false,
      });
    }

    // Insert message
    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [currentUser.user_id, receiver_id, content.trim()]
    );

    return res.status(200).json({
      message: result.rows[0],
      success: true,
    });
  } catch (err) {
    console.error("Error sending message:", err);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
    });
  }
});

// Get Messages - FIXED
router.get("/get-coversation-specific/:userId", async (req, res) => {
  try {
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50; // ✅ FIXED
    const offset = parseInt(req.query.offset) || 0; // ✅ FIXED

    // Check if connected
    const connectionCheck = await pool.query(
      `SELECT * FROM connections 
       WHERE user_id = $1 AND connection_id = $2`,
      [currentUser.user_id, userId]
    );

    if (connectionCheck.rows.length === 0) {
      return res.status(403).json({
        message: "Not connected with this user",
        success: false,
      });
    }

    // Fetch messages
    const query = `
      SELECT 
        m.*,
        u.full_name AS sender_name,
        u.username AS sender_username,
        u.profile_picture AS sender_picture
      FROM messages m
      JOIN users u ON m.sender_id = u.user_id
      WHERE 
        (m.sender_id = $1 AND m.receiver_id = $2)
        OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await pool.query(query, [
      currentUser.user_id,
      userId,
      limit,
      offset,
    ]);

    // Mark messages as read
    await pool.query(
      `UPDATE messages 
       SET read = TRUE 
       WHERE receiver_id = $1 AND sender_id = $2 AND read = FALSE`,
      [currentUser.user_id, userId]
    );

    return res.status(200).json({
      success: true,
      messages: result.rows.reverse(), // Oldest first
    });
  } catch (err) {
    console.error("Error fetching messages:", err);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
    });
  }
});

// Mark as read - FIXED
router.post("/mark_as_read", async (req, res) => {
  try {
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    const { sender_id } = req.body;

    await pool.query(
      `UPDATE messages 
       SET read = TRUE 
       WHERE receiver_id = $1 AND sender_id = $2 AND read = FALSE`,
      [currentUser.user_id, sender_id]
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error marking as read:", err);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
    });
  }
});

// Mark as read
// router.post("/mark_as_read", async (req, res) => {
//   try {
//     const currentUser = req.session.user;
//     if (!currentUser) {
//       return res.status(401).json({ message: "Unauthorized", success: false });
//     }

//     const { sender_id } = await req.json();

//     await pool.query(
//       `UPDATE messages
//        SET read = TRUE
//        WHERE receiver_id = $1 AND sender_id = $2 AND read = FALSE`,
//       [currentUser.user_id, sender_id]
//     );

//     return res.status(200).json({ success: true });
//   } catch (err) {
//     console.error("Error marking as read:", err);
//     return res
//       .status(500)
//       .json({ message: "Internal server error", success: false });
//   }
// });

// Unread Count
router.get("/unread_chat_count", async (req, res) => {
  try {
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    const result = await pool.query(
      `SELECT COUNT(*) as unread_count
       FROM messages
       WHERE receiver_id = $1 AND read = FALSE`,
      [currentUser.user_id]
    );

    return res.status(200).json({
      success: true,
      unread_count: parseInt(result.rows[0].unread_count),
    });
  } catch (err) {
    console.error("Error fetching unread count:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", success: false });
  }
});

module.exports = router;
