const fs = require("fs");
const path = require("path");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../config/s3");

const bucket = process.env.KRUTRIM_BUCKET;
const endpoint = (process.env.KRUTRIM_ENDPOINT || "").replace(/\/+$/, "");

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
};

function assertS3Env() {
  const missing = [];
  if (!process.env.KRUTRIM_ENDPOINT) missing.push("KRUTRIM_ENDPOINT");
  if (!process.env.KRUTRIM_BUCKET) missing.push("KRUTRIM_BUCKET");
  if (!process.env.KRUTRIM_PUBLIC_KEY) missing.push("KRUTRIM_PUBLIC_KEY");
  if (!process.env.KRUTRIM_SECRET_KEY) missing.push("KRUTRIM_SECRET_KEY");
  if (!process.env.KRUTRIM_REGION) missing.push("KRUTRIM_REGION");

  if (missing.length) {
    throw new Error(`Missing S3 env vars: ${missing.join(", ")}`);
  }
}

function guessContentType(filePath, fallback = "application/octet-stream") {
  const ext = path.extname(filePath || "").toLowerCase();
  return MIME_TYPES[ext] || fallback;
}

function encodeObjectKey(key) {
  return key
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function getPublicObjectUrl(key) {
  assertS3Env();
  return `${endpoint}/${bucket}/${encodeObjectKey(key)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableUploadError(err) {
  const retryableCodes = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNABORTED",
    "EPIPE",
    "NetworkingError",
  ]);

  const retryableNames = new Set([
    "TimeoutError",
    "RequestTimeout",
    "RequestTimeoutException",
    "InternalError",
    "ServiceUnavailable",
    "SlowDown",
  ]);

  const status = err?.$metadata?.httpStatusCode;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  if (retryableCodes.has(err?.code)) return true;
  if (retryableNames.has(err?.name)) return true;
  return Boolean(err?.$retryable);
}

async function uploadWithRetry(params, maxAttempts = 4) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      await s3.send(new PutObjectCommand(params));
      return;
    } catch (err) {
      const shouldRetry =
        attempt < maxAttempts && isRetryableUploadError(err);

      if (!shouldRetry) {
        throw err;
      }

      const backoffMs = Math.min(4000, 250 * 2 ** (attempt - 1));
      await sleep(backoffMs);
    }
  }
}

async function uploadBuffer({ key, body, contentType }) {
  assertS3Env();

  await uploadWithRetry({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType || "application/octet-stream",
  });

  return getPublicObjectUrl(key);
}

async function uploadFile({ localPath, key, contentType }) {
  const resolvedType = contentType || guessContentType(localPath);
  const body = await fs.promises.readFile(localPath);
  return uploadBuffer({ key, body, contentType: resolvedType });
}

function walkFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function uploadDirectory({ localDir, keyPrefix }) {
  const files = walkFiles(localDir);
  const normalizedPrefix = keyPrefix.replace(/\/+$/, "");

  const sortedFiles = [...files].sort((a, b) => {
    const aName = path.basename(a);
    const bName = path.basename(b);
    if (aName === "index.m3u8") return -1;
    if (bName === "index.m3u8") return 1;
    return a.localeCompare(b);
  });

  const concurrency = 4;
  const workers = [];
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < sortedFiles.length) {
      const currentIndex = cursor;
      cursor += 1;
      const fullPath = sortedFiles[currentIndex];
      const relativePath = toPosix(path.relative(localDir, fullPath));
      const key = `${normalizedPrefix}/${relativePath}`;
      await uploadFile({ localPath: fullPath, key });
    }
  };

  const workerCount = Math.min(concurrency, sortedFiles.length || 1);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(runWorker());
  }

  await Promise.all(workers);
}

module.exports = {
  getPublicObjectUrl,
  uploadBuffer,
  uploadFile,
  uploadDirectory,
};
