const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");

// POST /api/upload (for general use)
router.post("/", upload.single("file"), (req, res) => {
  try {
    return res.status(200).json({
      message: "File uploaded successfully!",
      fileUrl: req.file.location, // ✅ S3 file URL
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "File upload failed" });
  }
});

module.exports = router; // ✅ fixed export
