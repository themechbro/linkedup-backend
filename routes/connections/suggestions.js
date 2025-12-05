const express = require("express");
const router = express.Router();
const pool = require("../../db");

router.get("/suggestions", async (req, res) => {
  try {
    const currentUser = req.session.user;

    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const query = `
      SELECT 
        u.user_id,
        u.username,
        u.full_name,
        u.email,
        u.profile_picture,
        u.headline,
        u.type,
        u.isverified,
        COUNT(DISTINCT c.connection_id) AS mutual_connections
      FROM users u
      
      -- Exclude users already connected
      LEFT JOIN connections conn 
        ON (conn.user_id = $1 AND conn.connection_id = u.user_id)
      
      -- Exclude pending requests (both sent and received)
      LEFT JOIN connection_requests cr_sent
        ON (cr_sent.sender_id = $1 AND cr_sent.receiver_id = u.user_id AND cr_sent.status = 'pending')
      LEFT JOIN connection_requests cr_received
        ON (cr_received.sender_id = u.user_id AND cr_received.receiver_id = $1 AND cr_received.status = 'pending')
      
      -- Calculate mutual connections (friends of friends)
      LEFT JOIN connections my_connections
        ON my_connections.user_id = $1
      LEFT JOIN connections c
        ON c.user_id = u.user_id AND c.connection_id = my_connections.connection_id
      
      WHERE 
        u.user_id != $1                    -- Not the current user
        AND conn.connection_id IS NULL     -- Not already connected
        AND cr_sent.sender_id IS NULL      -- No pending request sent
        AND cr_received.sender_id IS NULL  -- No pending request received
      
      GROUP BY u.user_id, u.username, u.full_name, u.email, u.profile_picture, u.headline, u.type
      
      -- Prioritize users with mutual connections
      ORDER BY mutual_connections DESC, u.full_name ASC
      
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [
      currentUser.user_id,
      limit,
      offset,
    ]);

    return res.status(200).json({
      success: true,
      suggestions: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("Error fetching suggestions:", err);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
    });
  }
});

module.exports = router;
