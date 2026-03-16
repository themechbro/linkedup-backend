const path = require("path");
const fs = require("fs");
const { exec, spawn } = require("child_process");

// function runCommand(cmd) {
//   return new Promise((resolve, reject) => {
//     exec(cmd, (err, stdout, stderr) => {
//       //We can use spawn here and not exec because , let's say if a long video is in process FFMpeg print 100 lines of logs, which exceed
//       if (err) {
//         // 1MB instantly terminating FFmpeg process, and video conversion fail halfway.
//         return reject(new Error(stderr || err.message));
//       }
//       resolve({ stdout, stderr });
//     });
//   });
// }

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    // shell: true allows you to pass your exact existing command strings
    const process = spawn(cmd, { shell: true });

    let lastErrorLog = "";

    // FFmpeg streams its progress logs here.
    // We only keep the most recent chunk instead of accumulating it.
    // This keeps RAM usage near 0MB, no matter how long the video is.
    process.stderr.on("data", (data) => {
      lastErrorLog = data.toString();
    });

    process.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `FFmpeg exited with code ${code}. Last log: ${lastErrorLog}`,
          ),
        );
      }

      // Since convertToHLS and generateSprite don't use the console output,
      // we can just resolve without passing a massive string back.
      resolve();
    });

    process.on("error", (err) => {
      reject(err);
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

  const outputDir = path.join(__dirname, "..", "..", "uploads", "hls", videoId);

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

  const cmd = `ffmpeg -i "${inputPath}" -vf "fps=1/5,scale=160:90,tile=10x10" -q:v 2 "${spritePath}"`; //this creates a thumbnail for 8.3 minutes video only then either overwrite sprite image or attempt to create second one

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

// Now accepts the dynamic data returned from generateSprite

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
