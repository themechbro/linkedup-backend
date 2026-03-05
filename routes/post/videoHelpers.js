const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message));
      }
      resolve({ stdout, stderr });
    });
  });
}

async function convertToHLS(filename) {
  const videoId = path.parse(filename).name;
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
    videoId,
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "index.m3u8");
  const segmentPattern = path.join(outputDir, "segment_%03d.ts");

  const cmd = `ffmpeg -i "${inputPath}" -profile:v baseline -level 3.0 -start_number 0 -hls_time 10 -hls_list_size 0 -hls_segment_filename "${segmentPattern}" -f hls "${outputPath}"`;

  await runCommand(cmd);
  return { videoId, outputDir, outputPath };
}

async function generateSprite(filename) {
  const videoId = path.parse(filename).name;
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
    videoId,
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const spritePath = path.join(outputDir, "sprite.jpg");

  const cmd = `ffmpeg -i "${inputPath}" -vf "fps=1/5,scale=160:90,tile=10x10" -q:v 2 "${spritePath}"`;

  await runCommand(cmd);
  return spritePath;
}

function generateVTT(filename, duration) {
  const outputDir = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "sprites",
    path.parse(filename).name,
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
