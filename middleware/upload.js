const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Upload } = require("@aws-sdk/lib-storage");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3");

const upload = multer({ dest: "temp/" }); // store files temporarily

async function uploadToS3(file, folder = "uploads") {
  const fileStream = fs.createReadStream(file.path);
  const key = `${folder}/${Date.now()}-${file.originalname}`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: fileStream,
      ContentType: file.mimetype,
      // ACL: "public-read",
    },
  });

  const result = await upload.done();

  // Delete local temp file after upload
  fs.unlinkSync(file.path);

  return {
    key,
    url: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
  };
}

module.exports = { upload, uploadToS3 };
