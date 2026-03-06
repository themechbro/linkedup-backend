const express = require("express");
const fs = require("fs");

const router = express.Router();
const upload = require("../middleware/upload");
const pool = require("../db");
const { uploadFile, getPublicObjectUrl } = require("../utils/s3Storage");

const ALLOWED_UPLOAD_TYPES = new Set(["profile_pic", "cover_pic"]);

const removePathIfExists = async (targetPath) => {
  if (!targetPath) return;

  try {
    await fs.promises.unlink(targetPath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Cleanup failed for ${targetPath}:`, err);
    }
  }
};

router.post("/:type", upload.any(), async (req, res) => {
  const uploadedFile = req.files?.[0];

  try {
    const user = req.session?.user;
    if (!user?.user_id) {
      return res.status(401).json({ error: "Unauthorized Access" });
    }

    if (!uploadedFile) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { type } = req.params;
    if (!ALLOWED_UPLOAD_TYPES.has(type)) {
      return res.status(400).json({ error: "Invalid upload type" });
    }

    if (!uploadedFile.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image uploads are allowed" });
    }

    const objectKey = `images/${uploadedFile.filename}`;
    await uploadFile({
      localPath: uploadedFile.path,
      key: objectKey,
      contentType: uploadedFile.mimetype,
    });

    const fileUrl = getPublicObjectUrl(objectKey);

    if (type === "profile_pic") {
      await pool.query(`UPDATE users SET profile_picture = $1 WHERE user_id = $2`, [
        fileUrl,
        user.user_id,
      ]);
    } else {
      await pool.query(`UPDATE users SET cover_pic = $1 WHERE user_id = $2`, [
        fileUrl,
        user.user_id,
      ]);
    }

    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      fileUrl,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "File upload failed" });
  } finally {
    await removePathIfExists(uploadedFile?.path);
  }
});

module.exports = router;
