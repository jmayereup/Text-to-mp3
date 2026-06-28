const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Uploads a buffer to Cloudflare R2 bucket.
 * @param {Buffer} buffer File buffer to upload.
 * @param {string} fileName Destination file name.
 * @returns {Promise<string>} The public URL or key of the uploaded file.
 */
async function uploadToR2(buffer, fileName) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrlPrefix = process.env.R2_PUBLIC_URL_PREFIX;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Cloudflare R2 is not fully configured. Please check your .env file.');
  }

  // Configure S3 Client for Cloudflare R2
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  const uploadParams = {
    Bucket: bucketName,
    Key: fileName,
    Body: buffer,
    ContentType: 'audio/mpeg'
  };

  // Upload object to R2
  await s3.send(new PutObjectCommand(uploadParams));

  // Determine returned URL
  if (publicUrlPrefix) {
    // Trim trailing slash from prefix if it exists, then append filename
    const cleanPrefix = publicUrlPrefix.endsWith('/') 
      ? publicUrlPrefix.slice(0, -1) 
      : publicUrlPrefix;
    return `${cleanPrefix}/${fileName}`;
  } else {
    // Fallback: If no public prefix is provided, return bucket path indicator
    return `r2://${bucketName}/${fileName}`;
  }
}

/**
 * Checks if R2 configuration variables are present in the environment.
 * @returns {boolean} True if S3 client can be initialized.
 */
function isR2Configured() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

module.exports = {
  uploadToR2,
  isR2Configured
};
