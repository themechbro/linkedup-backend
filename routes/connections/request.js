const express = require("express");
const router = express.Router();
const pool = require("../../db");
const isAuthenticated = require("../../middleware/sessionChecker");

// send request
// router.post("/request", async (req, res) => {
//   try {
//     const { receiver_id } = req.body;
//     const sender_id = req.session.user.user_id;
//     const exists = await pool.query(
//       `SELECT * FROM connections
//        WHERE user_id=$1 AND connection_id=$2`,
//       [sender_id, receiver_id]
//     );
//     if (exists.rows.length > 0)
//       return res.status(400).json({ message: "Already connected" });

//     const pending = await pool.query(
//       `SELECT * FROM connection_requests
//        WHERE sender_id=$1 AND receiver_id=$2`,
//       [sender_id, receiver_id]
//     );
//     if (pending.rows.length > 0)
//       return res.status(400).json({ message: "Request already sent" });

//     await pool.query(
//       `INSERT INTO connection_requests (sender_id, receiver_id) VALUES ($1, $2)`,
//       [sender_id, receiver_id]
//     );
//     res.json({ message: "Connection request sent" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

router.post("/request", async (req, res) => {
  try {
    const { receiver_id } = req.body;
    const sender_id = req.session.user.user_id;

    const exists = await pool.query(
      `SELECT * FROM connections 
       WHERE user_id=$1 AND connection_id=$2`,
      [sender_id, receiver_id],
    );
    if (exists.rows.length > 0)
      return res.status(400).json({ message: "Already connected" });

    // 👇 Check for PENDING requests only
    const pending = await pool.query(
      `SELECT * FROM connection_requests 
       WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'`,
      [sender_id, receiver_id],
    );
    if (pending.rows.length > 0)
      return res.status(400).json({ message: "Request already sent" });

    // 👇 If there's a rejected/accepted request, delete it first
    await pool.query(
      `DELETE FROM connection_requests 
       WHERE sender_id=$1 AND receiver_id=$2`,
      [sender_id, receiver_id],
    );

    // 👇 Now insert new request
    await pool.query(
      `INSERT INTO connection_requests (sender_id, receiver_id) VALUES ($1, $2)`,
      [sender_id, receiver_id],
    );

    res.json({ message: "Connection request sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});
// Accept request
// Accept request
router.post("/accept", async (req, res) => {
  try {
    const { sender_id } = req.body;
    const receiver_id = req.session.user.user_id;

    const existingConnection = await pool.query(
      `SELECT * FROM connections 
       WHERE (user_id = $1 AND connection_id = $2) 
          OR (user_id = $2 AND connection_id = $1)`,
      [sender_id, receiver_id],
    );

    if (existingConnection.rows.length > 0) {
      return res.status(400).json({
        message: "Already connected",
        success: false,
      });
    }

    // 👇 DELETE the request after creating connection
    await pool.query(
      `DELETE FROM connection_requests 
       WHERE sender_id=$1 AND receiver_id=$2`,
      [sender_id, receiver_id],
    );

    // Create bidirectional connection
    await pool.query(
      `INSERT INTO connections (user_id, connection_id) 
       VALUES ($1, $2), ($2, $1)`,
      [sender_id, receiver_id],
    );

    res.json({ message: "You are now connected!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// reject request
// reject request
router.post("/reject", async (req, res) => {
  try {
    const { sender_id } = req.body;
    const receiver_id = req.session.user.user_id;

    // 👇 DELETE instead of UPDATE
    await pool.query(
      `DELETE FROM connection_requests 
       WHERE sender_id=$1 AND receiver_id=$2`,
      [sender_id, receiver_id],
    );

    res.json({ message: "Request rejected" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

//Remove connection
router.post("/remove", async (req, res) => {
  try {
    const { other_id } = req.body;
    const user = req.session.user.user_id;

    await pool.query(
      `DELETE FROM connections 
       WHERE (user_id=$1 AND connection_id=$2)
       OR (user_id=$2 AND connection_id=$1)`,
      [user, other_id],
    );

    res.json({ message: "Disconnected" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// Check if current_user if connected with the profile user
router.get("/check_connection", async (req, res) => {
  try {
    const user = req.session.user; // or req.user depending on your auth setup
    const { profileId } = req.query;

    if (!user) {
      return res.status(401).json({ message: "Unauthorised", success: false });
    }

    if (!profileId) {
      return res
        .status(400)
        .json({ message: "Profile ID required", success: false });
    }

    // Check if they're the same user
    if (user.user_id === profileId) {
      return res.json({
        connected: false,
        status: "own_profile",
        message: "This is your own profile",
      });
    }

    // Check if connected
    const connectionQuery = `
      SELECT connection_id 
      FROM connections 
      WHERE user_id = $1 AND connection_id = $2
    `;
    const connectionResult = await pool.query(connectionQuery, [
      user.user_id,
      profileId,
    ]);

    if (connectionResult.rows.length > 0) {
      return res.json({
        connected: true,
        status: "connected",
        message: "You are connected",
      });
    }

    // Check if there's a pending request
    const requestQuery = `
      SELECT sender_id, receiver_id, status 
      FROM connection_requests 
      WHERE (sender_id = $1 AND receiver_id = $2) 
         OR (sender_id = $2 AND receiver_id = $1)
      AND status = 'pending'
    `;
    const requestResult = await pool.query(requestQuery, [
      user.user_id,
      profileId,
    ]);

    if (requestResult.rows.length > 0) {
      const request = requestResult.rows[0];

      if (request.sender_id === user.user_id) {
        return res.json({
          connected: false,
          status: "pending",
          message: "Request sent",
        });
      } else {
        return res.json({
          connected: false,
          status: "incoming_request",
          message: "Pending request from this user",
          sender_id: request.sender_id,
        });
      }
    }

    // Not connected and no pending request
    return res.json({
      connected: false,
      status: "not_connected",
      message: "Not connected",
    });
  } catch (err) {
    console.error("Error checking connection:", err);
    res.status(500).json({ message: "Internal server error", success: false });
  }
});

router.get("/connection_length_user", async (req, res) => {
  try {
    const user = req.session.user;
    const { user_id } = req.query;

    // Optional: Remove this check if you want this endpoint to be public
    if (!user) {
      return res.status(401).json({ message: "Unauthorised", success: false });
    }

    if (!user_id) {
      return res
        .status(400)
        .json({ message: "Profile ID required", success: false });
    }

    // 👇 Use COUNT instead of fetching all rows
    const query = `SELECT COUNT(*) AS connection_count FROM connections WHERE user_id = $1`;
    const response = await pool.query(query, [user_id]);

    const totalConnections = parseInt(response.rows[0].connection_count);

    return res.status(200).json({
      totalConnections, // Changed from totalConnection for consistency
      success: true,
      forProfile: user_id,
    });
  } catch (err) {
    console.error("Error fetching connection count:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", success: false });
  }
});

router.get("/incoming_requests", isAuthenticated, async (req, res) => {
  const current_user = req.currentUser;

  try {
    const incoming_req = await pool.query(
      `SELECT sender_id FROM connection_requests WHERE receiver_id=$1`,
      [current_user.user_id],
    );

    const senderIds = incoming_req.rows.map((row) => row.sender_id);

    // ✅ If no incoming requests, return empty array
    if (senderIds.length === 0) {
      return res.json({ success: true, requests: [] });
    }

    // ✅ BETTER: Single query with IN clause (more efficient)
    const profileDetails = await pool.query(
      `SELECT user_id, username, full_name, headline, profile_picture, isVerified 
       FROM users 
       WHERE user_id = ANY($1)`,
      [senderIds],
    );

    res.json({
      success: true,
      requests: profileDetails.rows,
    });
  } catch (error) {
    console.error("Error fetching incoming requests:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});
module.exports = router;
