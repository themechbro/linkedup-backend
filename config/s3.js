// const { S3Client } = require("@aws-sdk/client-s3");

// const s3Client = new S3Client({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY,
//     secretAccessKey: process.env.AWS_ACCESS_SECRET,
//   },
//   forcePathStyle: false,
// });

// module.exports = s3Client;

// const { S3Client } = require("@aws-sdk/client-s3");
// const { NodeHttpHandler } = require("@aws-sdk/node-http-handler");

// const s3 = new S3Client({
//   region: process.env.KRUTRIM_REGION,
//   endpoint: process.env.KRUTRIM_ENDPOINT,
//   credentials: {
//     accessKeyId: process.env.KRUTRIM_PUBLIC_KEY,
//     secretAccessKey: process.env.KRUTRIM_SECRET_KEY,
//   },
//   forcePathStyle: true,
//   requestHandler: new NodeHttpHandler({
//     connectionTimeout: 10000,
//     socketTimeout: 300000, // 5 minutes
//   }),
// });

// module.exports = s3;
