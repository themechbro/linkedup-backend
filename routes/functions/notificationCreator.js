const pool = require("../../db");
const redisClient = require("../../redis/redisClient");

async function createNotification({
  recipientId,
  actorId,
  type,
  entityId = null,
  entityType = null,
  metadata = {},
}) {
  if (recipientId === actorId) return null;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      INSERT INTO notifications (
        recipient_id,
        actor_id,
        type,
        entity_id,
        entity_type,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
      `,
      [recipientId, actorId, type, entityId, entityType, metadata],
    );

    await client.query("COMMIT");

    // Increment unread count
    await redisClient.incr(`notif:count:${recipientId}`);

    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createNotification };
