const express = require("express");
const router = express.Router();
const pool = require("../../db");
const upload = require("../../middleware/upload");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const isAuthenticated = require("../../middleware/sessionChecker");
const redis = require("../../redis/redisClient");
const feedCache = require("../../redis/feedCacheManager");
const { convertToHLS, generateSprite } = require("./videoHelpers");
const {
  postIpLimiter,
  postUserLimiter,
} = require("../../middleware/rateLimiter");
const { feedFetchLimiter } = require("../../middleware/feedLimiter");
const { signInternalJwt } = require("../../utils/internalJwt");
const {
  getPublicObjectUrl,
  uploadBuffer,
  uploadFile,
  uploadDirectory,
  deleteObject,
} = require("../../utils/s3Storage");

// Helper connections
const getCachedConnections = async (userId) => {
  const key = `connections:${userId}`;

  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  const result = await pool.query(
    `SELECT connection_id FROM connections WHERE user_id = $1`,
    [userId],
  );

  const connectionIds = [
    userId,
    ...result.rows.map((row) => row.connection_id),
  ];

  await redis.set(
    key,
    JSON.stringify(connectionIds),
    { EX: 300 }, // 5 min TTL
  );

  return connectionIds;
};

const removePathIfExists = async (targetPath, asDirectory = false) => {
  if (!targetPath) return;

  try {
    if (asDirectory) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
      return;
    }

    await fs.promises.unlink(targetPath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Cleanup failed for ${targetPath}:`, err);
    }
  }
};

const rollbackTransaction = async (client) => {
  if (!client) return;

  try {
    await client.query("ROLLBACK");
  } catch (err) {
    if (err.code !== "25P01") {
      console.error("Rollback failed:", err);
    }
  }
};

const IMAGE_CONTENT_TYPE_FALLBACKS = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const buildDeterministicPostImageKey = (hash) => `posts/images/${hash}`;

const computeFileSha256 = (fileBuffer) =>
  crypto.createHash("sha256").update(fileBuffer).digest("hex");

// Gemini Suggestion for not maxing RAM
const computeFileSha256Stream = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
};

const parsePostMediaList = (mediaValue) => {
  if (Array.isArray(mediaValue)) return mediaValue;

  if (typeof mediaValue === "string") {
    try {
      const parsed = JSON.parse(mediaValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const getImageUrlCountsFromMediaList = (mediaList) => {
  const counts = new Map();

  for (const item of mediaList || []) {
    if (item?.type !== "images" || typeof item?.url !== "string") {
      continue;
    }

    counts.set(item.url, (counts.get(item.url) || 0) + 1);
  }

  return counts;
};

const getMediaRowsByUrls = async (client, urls) => {
  if (!urls.length) return new Map();

  const result = await client.query(
    `SELECT id, url, object_key, usage_count
     FROM media
     WHERE url = ANY($1)`,
    [urls],
  );

  return new Map(result.rows.map((row) => [row.url, row]));
};

const getImageMediaUsageCounts = async (client, mediaList) => {
  const imageUrlCounts = getImageUrlCountsFromMediaList(mediaList);
  const urls = Array.from(imageUrlCounts.keys());

  if (!urls.length) return new Map();

  const mediaRowsByUrl = await getMediaRowsByUrls(client, urls);
  const mediaCounts = new Map();

  for (const [url, count] of imageUrlCounts.entries()) {
    const mediaRow = mediaRowsByUrl.get(url);
    if (!mediaRow) continue;

    mediaCounts.set(mediaRow.id, (mediaCounts.get(mediaRow.id) || 0) + count);
  }

  return mediaCounts;
};

const decrementMediaUsageBy = async (client, mediaId, decrementBy = 1) => {
  if (!mediaId || decrementBy <= 0) return null;

  const usageResult = await client.query(
    `UPDATE media
     SET usage_count = GREATEST(usage_count - $2, 0)
     WHERE id = $1
     RETURNING id, object_key, usage_count`,
    [mediaId, decrementBy],
  );

  if (usageResult.rowCount === 0) return null;

  const mediaRow = usageResult.rows[0];
  if (mediaRow.usage_count > 0) return null;

  const deleteResult = await client.query(
    `DELETE FROM media
     WHERE id = $1 AND usage_count = 0
     RETURNING object_key`,
    [mediaId],
  );

  return deleteResult.rows[0]?.object_key || null;
};

// const getOrCreateDedupedImageMedia = async (file, client) => {
//   const fileBuffer = await fs.promises.readFile(file.path); // These 2 lines can cause a node crash by maxing RAM
//   const hash = computeFileSha256(fileBuffer); //

//   const existingMedia = await client.query(
//     `UPDATE media
//      SET usage_count = usage_count + 1
//      WHERE hash = $1
//      RETURNING id, hash, object_key, url, size, content_type, usage_count`,
//     [hash],
//   );

//   if (existingMedia.rowCount > 0) {
//     return existingMedia.rows[0];
//   }

//   const extension = path.extname(file.originalname || "").toLowerCase();
//   const contentType =
//     file.mimetype ||
//     IMAGE_CONTENT_TYPE_FALLBACKS[extension] ||
//     "application/octet-stream";
//   const objectKey = buildDeterministicPostImageKey(hash);
//   const url = getPublicObjectUrl(objectKey);

//   await uploadBuffer({
//     key: objectKey,
//     body: fileBuffer,
//     contentType,
//   });

//   const insertResult = await client.query(
//     `INSERT INTO media (hash, object_key, url, size, content_type, usage_count)
//      VALUES ($1, $2, $3, $4, $5, 1)
//      ON CONFLICT (hash)
//      DO UPDATE SET usage_count = media.usage_count + 1
//      RETURNING id, hash, object_key, url, size, content_type, usage_count`,
//     [hash, objectKey, url, file.size || fileBuffer.length, contentType],
//   );

//   return insertResult.rows[0];
// };

const getOrCreateDedupedImageMedia = async (file, client) => {
  // 1. Calculate hash via stream (RAM stays low!)
  const hash = await computeFileSha256Stream(file.path);

  // 2. Check Database
  const existingMedia = await client.query(
    `UPDATE media
     SET usage_count = usage_count + 1
     WHERE hash = $1
     RETURNING id, hash, object_key, url, size, content_type, usage_count`,
    [hash],
  );

  if (existingMedia.rowCount > 0) {
    return existingMedia.rows[0];
  }

  // 3. Prepare Upload Data
  const extension = path.extname(file.originalname || "").toLowerCase();
  const contentType =
    file.mimetype ||
    IMAGE_CONTENT_TYPE_FALLBACKS[extension] ||
    "application/octet-stream";
  const objectKey = buildDeterministicPostImageKey(hash);
  const url = getPublicObjectUrl(objectKey);

  // 4. Upload via Stream instead of Buffer
  const fileStream = fs.createReadStream(file.path);

  await uploadStream({
    // <-- Notice this changed to a stream uploader
    key: objectKey,
    body: fileStream,
    contentType,
  });

  // 5. Database Insert
  const insertResult = await client.query(
    `INSERT INTO media (hash, object_key, url, size, content_type, usage_count)
     VALUES ($1, $2, $3, $4, $5, 1)
     ON CONFLICT (hash)
     DO UPDATE SET usage_count = media.usage_count + 1
     RETURNING id, hash, object_key, url, size, content_type, usage_count`,
    [hash, objectKey, url, file.size, contentType],
  );

  return insertResult.rows[0];
};

const processUploadedPostFilesWithDedup = async (files, client) => {
  const media = [];

  for (const file of files) {
    if (file?.mimetype?.startsWith("video")) {
      media.push(await uploadVideoToKrutrim(file));
      continue;
    }

    const dedupedMedia = await getOrCreateDedupedImageMedia(file, client);
    media.push({ url: dedupedMedia.url, type: "images" });
  }

  return media;
};

const getFirstImageMediaIdFromMediaList = async (client, mediaList) => {
  const imageUrls = [];

  for (const item of mediaList || []) {
    if (item?.type === "images" && typeof item?.url === "string") {
      imageUrls.push(item.url);
    }
  }

  if (!imageUrls.length) return null;

  const rowsByUrl = await getMediaRowsByUrls(client, imageUrls);

  for (const item of mediaList) {
    if (item?.type !== "images" || typeof item?.url !== "string") continue;

    const mediaRow = rowsByUrl.get(item.url);
    if (mediaRow?.id) {
      return mediaRow.id;
    }
  }

  return null;
};

const getRemovedImageObjectKeys = async (
  client,
  beforeMediaList,
  afterMediaList,
) => {
  const beforeCounts = await getImageMediaUsageCounts(client, beforeMediaList);
  const afterCounts = await getImageMediaUsageCounts(client, afterMediaList);
  const objectKeysToDelete = [];

  for (const [mediaId, beforeCount] of beforeCounts.entries()) {
    const afterCount = afterCounts.get(mediaId) || 0;
    const decrementBy = beforeCount - afterCount;

    if (decrementBy <= 0) continue;

    const deletedObjectKey = await decrementMediaUsageBy(
      client,
      mediaId,
      decrementBy,
    );

    if (deletedObjectKey) {
      objectKeysToDelete.push(deletedObjectKey);
    }
  }

  return objectKeysToDelete;
};

const uploadVideoToKrutrim = async (file) => {
  const videoId = path.parse(file.filename).name;
  const hlsPrefix = `posts/hls/${videoId}`;
  const spriteKey = `posts/sprites/${videoId}/sprite.jpg`;

  let hlsOutputDir = null;
  let spritePath = null;

  try {
    const [hlsResult, generatedSpritePath] = await Promise.all([
      convertToHLS(file.filename),
      generateSprite(file.filename),
    ]);

    hlsOutputDir = hlsResult.outputDir;
    spritePath = generatedSpritePath;

    await uploadDirectory({
      localDir: hlsOutputDir,
      keyPrefix: hlsPrefix,
    });

    await uploadFile({
      localPath: spritePath,
      key: spriteKey,
      contentType: "image/jpeg",
    });

    return {
      url: getPublicObjectUrl(`${hlsPrefix}/index.m3u8`),
      type: "videos",
      sprite_url: getPublicObjectUrl(spriteKey),
    };
  } finally {
    await Promise.all([
      removePathIfExists(file.path),
      removePathIfExists(hlsOutputDir, true),
      removePathIfExists(spritePath ? path.dirname(spritePath) : null, true),
    ]);
  }
};

router.post(
  "/",
  postUserLimiter,
  postIpLimiter,
  upload.array("media", 10),
  async (req, res) => {
    const files = req.files || [];
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      if (!req.session.user || !req.session.user.user_id) {
        await rollbackTransaction(client);
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { content } = req.body;
      const owner = req.session.user.user_id;
      const media = await processUploadedPostFilesWithDedup(files, client);
      const mediaId = await getFirstImageMediaIdFromMediaList(client, media);

      const result = await client.query(
        `INSERT INTO posts (content, media_url, media_id, likes, status, owner, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [content, JSON.stringify(media), mediaId, 0, "created", owner],
      );

      await client.query("COMMIT");

      // ⭐ Invalidate feed cache for all connections
      feedCache.invalidateConnectionFeeds(owner).catch((err) => {
        console.error("Cache invalidation error:", err);
      });

      res.status(201).json({
        message: "Post created successfully",
        post: result.rows[0],
      });
    } catch (err) {
      await rollbackTransaction(client);
      console.error("Error creating post:", err);
      res.status(500).json({ message: "Internal Server Error" });
    } finally {
      await Promise.all(files.map((file) => removePathIfExists(file.path)));
      client.release();
    }
  },
);

// global post fetch (which is obselete)
router.get("/", async (req, res) => {
  try {
    const currentUser = req.session.user;
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

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
    COUNT(DISTINCT c.comment_id) AS comment_count,

    MAX(CASE 
      WHEN (cr.sender_id = $3 AND cr.receiver_id = p.owner AND cr.status = 'pending') 
      THEN 'pending_sent'
      WHEN (cr.sender_id = p.owner AND cr.receiver_id = $3 AND cr.status = 'pending') 
      THEN 'pending_received'
      ELSE NULL 
    END) AS request_status,

    BOOL_OR(con.user_id IS NOT NULL) AS is_connected

  FROM posts p
  JOIN users u 
    ON p.owner = u.user_id

  LEFT JOIN comments c 
    ON c.post_id = p.id

  LEFT JOIN connection_requests cr 
    ON ((cr.sender_id = $3 AND cr.receiver_id = p.owner)
        OR (cr.sender_id = p.owner AND cr.receiver_id = $3))
    AND cr.status = 'pending'

  LEFT JOIN connections con
    ON (con.user_id = $3 AND con.connection_id = p.owner)

  GROUP BY p.id, u.user_id
  ORDER BY p.created_at DESC
  LIMIT $1 OFFSET $2
  `,
      [limit, offset, currentUser.user_id],
    );

    const posts = [];

    for (let post of result.rows) {
      let status = "not_connected";
      const viewer = currentUser.user_id;

      if (post.is_connected) {
        status = "connected";
      } else if (post.request_status === "pending_sent") {
        status = "pending";
      } else if (post.request_status === "pending_received") {
        status = "incoming_request";
      }

      let enriched = {
        ...post,
        connection_status: status,
        liked_by_me: post.liked_by?.includes(viewer) || false,
        current_user: viewer,
      };

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
          [post.repost_of],
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

router.get("/likelist", isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.currentUser;

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
      [post_id],
    );

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
    const client = await pool.connect();
    const files = req.files || [];
    let objectKeysToDelete = [];

    try {
      await client.query("BEGIN");

      const currentUser = req.session.user;
      if (!currentUser) {
        await rollbackTransaction(client);
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { post_id } = req.params;
      const { content, existingMedia } = req.body;
      const status = "edited";

      let existingMediaList = [];
      try {
        if (existingMedia) {
          const parsed = JSON.parse(existingMedia);
          existingMediaList = Array.isArray(parsed) ? parsed : [];
        }
      } catch (err) {
        console.log("Invalid existing media JSON");
        await rollbackTransaction(client);
        return res.status(400).json({ message: "Invalid existing media JSON" });
      }

      const postQuery = await client.query(
        "SELECT * FROM posts WHERE id=$1 FOR UPDATE",
        [post_id],
      );

      if (postQuery.rows.length === 0) {
        await rollbackTransaction(client);
        return res.status(404).json({ message: "Post not found" });
      }

      const post = postQuery.rows[0];
      const previousMediaList = parsePostMediaList(post.media_url);

      if (post.owner !== currentUser.user_id) {
        await rollbackTransaction(client);
        return res.status(403).json({
          message: "You cannot edit this post",
        });
      }

      const newMedia = await processUploadedPostFilesWithDedup(files, client);
      const finalMedia = [...existingMediaList, ...newMedia];
      const nextMediaId = await getFirstImageMediaIdFromMediaList(
        client,
        finalMedia,
      );
      objectKeysToDelete = await getRemovedImageObjectKeys(
        client,
        previousMediaList,
        existingMediaList,
      );

      const updateQuery = await client.query(
        `UPDATE posts
         SET content = $1, media_url = $2, status = $3, media_id = $4
         WHERE id = $5
         RETURNING *`,
        [content, JSON.stringify(finalMedia), status, nextMediaId, post_id],
      );

      await client.query("COMMIT");

      for (const objectKey of objectKeysToDelete) {
        deleteObject({ key: objectKey }).catch((error) => {
          console.error("Failed to delete unused media object:", error);
        });
      }

      // ⭐ Invalidate cache for all connections
      feedCache.invalidateConnectionFeeds(currentUser.user_id).catch((err) => {
        console.error("Cache invalidation error:", err);
      });

      return res.status(200).json({
        message: "Post edited successfully",
        post: updateQuery.rows[0],
      });
    } catch (err) {
      await rollbackTransaction(client);
      console.error("Error editing post:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    } finally {
      await Promise.all(files.map((file) => removePathIfExists(file.path)));
      client.release();
    }
  },
);

// Repost route
router.post("/:postId/repost", async (req, res) => {
  const { postId } = req.params;
  const userId = req.session.user.user_id;

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
      [userId, postId],
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
      ],
    );

    // 4. Increment repost_count on original post
    await pool.query(
      "UPDATE posts SET repost_count = repost_count + 1 WHERE id = $1",
      [postId],
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

router.delete("/delete/:post_id", async (req, res) => {
  const client = await pool.connect();
  let objectKeysToDelete = [];

  try {
    await client.query("BEGIN");

    const currentUser = req.session.user;
    if (!currentUser) {
      await rollbackTransaction(client);
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { post_id } = req.params;

    const postQuery = await client.query(
      "SELECT * FROM posts WHERE id=$1 FOR UPDATE",
      [post_id],
    );

    if (postQuery.rows.length === 0) {
      await rollbackTransaction(client);
      return res.status(404).json({ message: "Post not found" });
    }

    const post = postQuery.rows[0];
    const previousMediaList = parsePostMediaList(post.media_url);

    if (post.owner !== currentUser.user_id) {
      await rollbackTransaction(client);
      return res.status(403).json({
        message: "You cannot delete this post",
      });
    }

    await client.query("DELETE FROM posts WHERE id=$1", [post_id]);

    objectKeysToDelete = await getRemovedImageObjectKeys(
      client,
      previousMediaList,
      [],
    );

    await client.query("COMMIT");

    for (const objectKey of objectKeysToDelete) {
      deleteObject({ key: objectKey }).catch((error) => {
        console.error("Failed to delete unused media object:", error);
      });
    }

    // ⭐ Invalidate cache for all connections
    feedCache.invalidateConnectionFeeds(currentUser.user_id).catch((err) => {
      console.error("Cache invalidation error:", err);
    });

    return res.status(200).json({
      message: "Post deleted successfully",
    });
  } catch (err) {
    await rollbackTransaction(client);
    console.error("Error deleting post:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    client.release();
  }
});

router.get("/getPost", async (req, res) => {
  try {
    const { postId } = req.query;
    const user = req.session.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }

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

// ========================================================
// ⭐ REDIS-CACHED CONNECTION FEED WITH CACHE MANAGER
// ========================================================
router.get(
  "/getconnectionsPost",
  isAuthenticated,
  feedFetchLimiter,
  async (req, res) => {
    const userId = req.currentUser.user_id;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    try {
      const token = signInternalJwt(req.currentUser);
      // ⭐ STEP 1: Check Redis cache
      const cachedFeed = await feedCache.getCachedFeed(userId, limit, offset);

      if (cachedFeed) {
        return res.status(200).json(cachedFeed);
      }

      // ⭐ STEP 2: Fetch connection IDs from database
      // const result = await pool.query(
      //   `SELECT connection_id FROM connections WHERE user_id = $1`,
      //   [userId],
      // );

      // // const connectionIds = result.rows.map((row) => row.connection_id);
      // const connectionIds = [
      //   userId, // 👈 include self posts
      //   ...result.rows.map((row) => row.connection_id),
      // ];

      const connectionIds = await getCachedConnections(userId);

      if (connectionIds.length === 0) {
        const emptyResponse = {
          success: true,
          feed: [],
          limit,
          offset,
        };

        // Cache empty result
        await feedCache.cacheFeed(userId, limit, offset, emptyResponse);

        return res.status(200).json(emptyResponse);
      }

      // ⭐ STEP 3: Call Java Feed microservice
      const feedResponse = await fetch(
        `${process.env.SPRING_MICROSERVICE}/api/feed?limit=${limit}&offset=${offset}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(connectionIds),
        },
      );

      if (!feedResponse.ok) {
        throw new Error("Feed service failed");
      }

      const feed = await feedResponse.json();

      // ⭐ STEP 4: Collect ALL user IDs (reposter + original author)
      const userIdSet = new Set();

      feed.forEach((post) => {
        if (post.owner) userIdSet.add(post.owner);

        if (post.repostedPost?.owner) {
          userIdSet.add(post.repostedPost.owner);
        }
      });

      const userIds = Array.from(userIdSet);

      // ⭐ STEP 5: Fetch user details in ONE query
      const usersResult = await pool.query(
        `
      SELECT user_id, username, full_name, type, profile_picture
      FROM users
      WHERE user_id = ANY($1)
      `,
        [userIds],
      );

      // ⭐ STEP 6: Build lookup map
      const userMap = Object.fromEntries(
        usersResult.rows.map((user) => [user.user_id, user]),
      );

      // ⭐ STEP 7: Enrich feed
      const enrichedFeed = feed.map((post) => {
        const reposter = userMap[post.owner];

        // 🔁 REPOST
        if (post.repostOf && post.repostedPost) {
          const originalAuthor = userMap[post.repostedPost.owner];

          return {
            ...post,

            username: reposter?.username || "",
            full_name: reposter?.full_name || "",
            type: reposter?.type || "normal",
            profile_picture: reposter?.profile_picture || null,

            repostedPost: {
              ...post.repostedPost,
              media_url: post.repostedPost.mediaUrl
                ? JSON.parse(post.repostedPost.mediaUrl)
                : [],
              username: originalAuthor?.username || "",
              full_name: originalAuthor?.full_name || "",
              type: originalAuthor?.type || "normal",
              profile_picture: originalAuthor?.profile_picture || null,
              liked_by_me: post.repostedPost.likedBy?.includes(userId) || false,
            },

            liked_by: post.likedBy || [],
            liked_by_me: false,
            current_user: userId,
            connection_status: "connected",
          };
        }

        // 🟢 NORMAL POST
        return {
          ...post,

          media_url: post.mediaUrl ? JSON.parse(post.mediaUrl) : [],

          username: reposter?.username || "",
          full_name: reposter?.full_name || "",
          type: reposter?.type || "normal",
          profile_picture: reposter?.profile_picture || null,

          liked_by: post.likedBy || [],
          liked_by_me: post.likedBy?.includes(userId) || false,
          current_user: userId,
          connection_status: "connected",
        };
      });

      // ⭐ STEP 8: Prepare and cache response
      const response = {
        success: true,
        feed: enrichedFeed,
        limit,
        offset,
        currentUser: userId,
      };

      // Cache the result
      await feedCache.cacheFeed(userId, limit, offset, response);

      // ⭐ STEP 9: Send enriched feed
      return res.status(200).json(response);
    } catch (err) {
      console.error("Feed error:", err);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch feed",
      });
    }
  },
);

router.get("/checkLatestConnectionPost", isAuthenticated, async (req, res) => {
  const userId = req.currentUser.user_id;

  try {
    const token = signInternalJwt(req.currentUser);
    // Get user's connections
    const result = await pool.query(
      `SELECT connection_id FROM connections WHERE user_id = $1`,
      [userId],
    );

    const connectionIds = result.rows.map((r) => r.connection_id);

    if (connectionIds.length === 0) {
      return res.json({ latestPostId: null, hasNewPosts: false });
    }

    // Get latest post from microservice
    const latest = await fetch(
      `${process.env.SPRING_MICROSERVICE}/api/feed/latest`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(connectionIds),
      },
    );

    if (!latest.ok) {
      console.error("Spring service failed:", latest.status);
      return res.status(500).json({ error: "Feed service unavailable" });
    }

    const latestResponse = await latest.json();

    if (!latestResponse || !latestResponse.postId) {
      return res.json({ latestPostId: null, hasNewPosts: false });
    }

    const latestPostId = latestResponse.postId;

    // ✅ NEW: Check last seen post from Redis
    const lastSeenKey = `user:${userId}:lastSeenPost`;
    const lastSeenPostId = await redis.get(lastSeenKey);

    // Determine if there are new posts
    const hasNewPosts = lastSeenPostId ? latestPostId !== lastSeenPostId : true;

    res.json({
      latestPostId,
      hasNewPosts,
      lastSeenPostId,
    });
  } catch (error) {
    console.error("Error checking latest post:", error);
    res.status(500).json({ error: "Failed to check latest post" });
  }
});

// ✅ NEW: Mark post as seen
router.post("/markPostAsSeen", isAuthenticated, async (req, res) => {
  const userId = req.currentUser.user_id;
  const { postId } = req.body;

  try {
    const lastSeenKey = `user:${userId}:lastSeenPost`;

    // Store last seen post ID (expire after 30 days)
    await redis.setEx(lastSeenKey, 30 * 24 * 60 * 60, postId.toString());

    res.json({ success: true, lastSeenPostId: postId });
  } catch (error) {
    console.error("Error marking post as seen:", error);
    res.status(500).json({ error: "Failed to mark post as seen" });
  }
});

module.exports = router;
