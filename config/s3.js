const { S3Client } = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@aws-sdk/node-http-handler");

const s3 = new S3Client({
  region: process.env.KRUTRIM_REGION,
  endpoint: process.env.KRUTRIM_ENDPOINT,
  credentials: {
    accessKeyId: process.env.KRUTRIM_PUBLIC_KEY,
    secretAccessKey: process.env.KRUTRIM_SECRET_KEY,
  },
  forcePathStyle: true,
  maxAttempts: 4,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 10000,
    socketTimeout: 300000,
  }),
});

module.exports = s3;
