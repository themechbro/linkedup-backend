const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

function convertToHLS(filename) {
  const inputPath = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "videos",
    filename,
  );

  const outputDir = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "hls",
    filename.split(".")[0],
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "index.m3u8");

  const cmd = `ffmpeg -i "${inputPath}" -profile:v baseline -level 3.0 -start_number 0 -hls_time 10 -hls_list_size 0 -hls_segment_filename "${outputDir}/segment_%03d.ts" -f hls "${outputPath}"`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error("FFmpeg error:", stderr);
    } else {
      console.log("HLS created for:", filename);
    }
  });
}

function generateSprite(filename) {
  const inputPath = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "videos",
    filename,
  );

  const outputDir = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "sprites",
    filename.split(".")[0],
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const spritePath = path.join(outputDir, "sprite.jpg");

  const cmd = `ffmpeg -i "${inputPath}" -vf "fps=1/5,scale=160:90,tile=10x10" -q:v 2 "${spritePath}"`;

  exec(cmd, (err) => {
    if (err) console.error("Sprite error:", err);
    else console.log("Sprite created:", filename);
  });
}

function generateVTT(filename, duration) {
  const outputDir = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "sprites",
    filename.split(".")[0],
  );

  const vttPath = path.join(outputDir, "sprite.vtt");

  const interval = 5;
  const cols = 10;
  const thumbWidth = 160;
  const thumbHeight = 90;

  let vtt = "WEBVTT\n\n";

  let index = 0;

  for (let time = 0; time < duration; time += interval) {
    const x = (index % cols) * thumbWidth;
    const y = Math.floor(index / cols) * thumbHeight;

    vtt += `${formatTime(time)}.000 --> ${formatTime(time + interval)}.000\n`;
    vtt += `sprite.jpg#xywh=${x},${y},${thumbWidth},${thumbHeight}\n\n`;

    index++;
  }

  fs.writeFileSync(vttPath, vtt);
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}:${s}`;
}

module.exports = {
  convertToHLS,
  generateSprite,
  generateVTT,
};
