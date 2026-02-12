const fs = require("fs");
const path = require("path");
const { generateSprite } = require("../routes/post/videoHelpers");

const videosDir = path.join(__dirname, "..", "uploads", "videos");
const spritesDir = path.join(__dirname, "..", "uploads", "sprites");

async function generateSpritesForExisting() {
  if (!fs.existsSync(videosDir)) {
    console.log("Videos folder not found");
    return;
  }

  const files = fs.readdirSync(videosDir);

  console.log(`Found ${files.length} videos`);

  for (const file of files) {
    const videoId = file.split(".")[0];

    const spritePath = path.join(spritesDir, videoId, "sprite.jpg");

    if (fs.existsSync(spritePath)) {
      console.log(`Skipping (already exists): ${file}`);
      continue;
    }

    console.log(`Generating sprite for: ${file}`);

    generateSprite(file);
  }
}

generateSpritesForExisting();
