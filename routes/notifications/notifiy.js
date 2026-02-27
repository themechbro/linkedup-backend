const pool = require("../../db/index");
const app = require("express");
const isAuthenticated = require("../../middleware/sessionChecker");
const router = app.Router();
const redisClient = require("../../redis/redisClient");
router.get("/notifications", isAuthenticated, async (req, res) => {
  const user = req.currentUser;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const userId = user.user_id;

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    // 1️⃣ Fetch notifications + actor details
    const { rows } = await pool.query(
      `
      SELECT 
        n.id,
        n.type,
        n.entity_id,
        n.entity_type,
        n.metadata,
        n.is_read,
        n.created_at,

        u.user_id AS actor_id,
        u.username,
        u.full_name,
        u.profile_picture

      FROM notifications n
      JOIN users u ON n.actor_id = u.user_id
      WHERE n.recipient_id = $1
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    );

    // 2️⃣ Get unread count from Redis
    const redisKey = `notif:count:${userId}`;
    let unreadCount = await redisClient.get(redisKey);

    if (unreadCount === null) {
      const countResult = await pool.query(
        `
        SELECT COUNT(*) 
        FROM notifications 
        WHERE recipient_id = $1 AND is_read = FALSE
        `,
        [userId],
      );

      unreadCount = parseInt(countResult.rows[0].count);
      await redisClient.set(redisKey, unreadCount);
    }

    res.json({
      notifications: rows,
      unreadCount: parseInt(unreadCount),
      pagination: {
        limit,
        offset,
        hasMore: rows.length === limit,
      },
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/notifications/mark-read", isAuthenticated, async (req, res) => {
  const user = req.currentUser;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const userId = user.user_id;

  try {
    await pool.query(
      `
      UPDATE notifications
      SET is_read = TRUE
      WHERE recipient_id = $1 AND is_read = FALSE
      `,
      [userId],
    );

    // Reset Redis counter
    await redisClient.set(`notif:count:${userId}`, 0);

    res.json({ message: "Notifications marked as read" });
  } catch (err) {
    console.error("Error marking notifications:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/notifications/unread-count", isAuthenticated, async (req, res) => {
  const user = req.currentUser;
  if (!user)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const userId = user.user_id;
  const redisKey = `notif:count:${userId}`;

  try {
    // 1️⃣ Try Redis first
    let unreadCount = await redisClient.get(redisKey);

    if (unreadCount !== null) {
      return res.json({
        success: true,
        unreadCount: parseInt(unreadCount),
      });
    }

    // 2️⃣ Fallback to DB
    const { rows } = await pool.query(
      `
      SELECT COUNT(*) 
      FROM notifications 
      WHERE recipient_id = $1 AND is_read = FALSE
      `,
      [userId],
    );

    unreadCount = parseInt(rows[0].count);

    // 3️⃣ Cache it in Redis
    await redisClient.set(redisKey, unreadCount);

    return res.json({
      success: true,
      unreadCount,
    });
  } catch (err) {
    console.error("Error fetching unread count:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

module.exports = router;
