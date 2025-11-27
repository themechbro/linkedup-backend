const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const path = require("path");
const pool = require("../db");

// POST /api/upload (for general use)
router.post("/:type", upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadedFile = req.files[0];
    const { type } = req.params;

    const isVideo = uploadedFile.mimetype.startsWith("video");
    const folder = isVideo ? "videos" : "images";

    const fileUrl = `/uploads/${folder}/${uploadedFile.filename}`;

    const user = req.session?.user;

    if (user) {
      if (type === "profile_pic") {
        await pool.query(
          `UPDATE users SET profile_picture = $1 WHERE user_id = $2`,
          [fileUrl, user.user_id]
        );
      }

      if (type === "cover_pic") {
        await pool.query(`UPDATE users SET cover_pic = $1 WHERE user_id = $2`, [
          fileUrl,
          user.user_id,
        ]);
      }
    }

    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      fileUrl,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "File upload failed" });
  }
});

module.exports = router; // ✅ fixed export
