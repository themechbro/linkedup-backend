const multer = require("multer");
const path = require("path");
const fs = require("fs");

const imagePath = path.join(__dirname, "..", "uploads", "images");
const videoPath = path.join(__dirname, "..", "uploads", "videos");

if (!fs.existsSync(imagePath)) fs.mkdirSync(imagePath, { recursive: true });
if (!fs.existsSync(videoPath)) fs.mkdirSync(videoPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isVideo = file.mimetype.startsWith("video");
    cb(null, isVideo ? videoPath : imagePath);
  },
  filename: (req, file, cb) => {
    const filename = `${Date.now()}-${file.originalname}`;
    cb(null, filename);
  },
});

const upload = multer({ storage });

module.exports = upload;
