const express = require("express");
const router = express.Router();
const pool = require("../../db");

// send request
router.post("/request", async (req, res) => {
  try {
    const { receiver_id } = req.body;
    const sender_id = req.session.user.user_id;
    const exists = await pool.query(
      `SELECT * FROM connections 
       WHERE user_id=$1 AND connection_id=$2`,
      [sender_id, receiver_id]
    );
    if (exists.rows.length > 0)
      return res.status(400).json({ message: "Already connected" });

    const pending = await pool.query(
      `SELECT * FROM connection_requests 
       WHERE sender_id=$1 AND receiver_id=$2`,
      [sender_id, receiver_id]
    );
    if (pending.rows.length > 0)
      return res.status(400).json({ message: "Request already sent" });

    await pool.query(
      `INSERT INTO connection_requests (sender_id, receiver_id) VALUES ($1, $2)`,
      [sender_id, receiver_id]
    );
    res.json({ message: "Connection request sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Accept request
router.post("/accept", async (req, res) => {
  try {
    const { sender_id } = req.body;
    const receiver_id = req.session.user.user_id;

    // Update request
    await pool.query(
      `UPDATE connection_requests 
       SET status='accepted' 
       WHERE sender_id=$1 AND receiver_id=$2`,
      [sender_id, receiver_id]
    );
    await pool.query(
      `INSERT INTO connections (user_id, connection_id) 
       VALUES ($1, $2), ($2, $1)`,
      [sender_id, receiver_id]
    );
    res.json({ message: "You are now connected!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// reject request
router.post("/reject", async (req, res) => {
  try {
    const { sender_id } = req.body;
    const receiver_id = req.session.user.user_id;

    await pool.query(
      `UPDATE connection_requests 
       SET status='rejected' 
       WHERE sender_id=$1 AND receiver_id=$2`,
      [sender_id, receiver_id]
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
      [user, other_id]
    );

    res.json({ message: "Disconnected" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
