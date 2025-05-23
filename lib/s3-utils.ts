import { GetObjectCommand,PutObjectCommand } from "@aws-sdk/client-s3"
import { s3Client, isAwsConfigured, getAssetUrl } from "./aws"
import { Readable } from "stream"

/**
 * Upload a file to S3
 * @param file The file to upload
 * @param key The S3 object key (path + filename)
 * @param contentType Optional content type
 * @returns The URL of the uploaded file through CloudFront
 */
export async function uploadFileToS3(
  file: File | Blob,
  key: string,
  contentType?: string
): Promise<string> {
  if (!isAwsConfigured() || !s3Client) {
    throw new Error("AWS S3 is not configured")
  }

  // Convert file to buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Set up the upload parameters
  const params = {
    Bucket: process.env.AWS_BUCKET_PUBLIC,
    Key: key,
    Body: buffer,
    ContentType: contentType || file.type,
    CacheControl: key.includes('hackathon/covers') ? 'no-cache' : "public, max-age=31536000",
  }

  // Upload to S3
  await s3Client.send(new PutObjectCommand(params))
  
  // Get the URL (with timestamp for cache busting)
  const url = getAssetUrl(key, true)
  if (!url) {
    throw new Error("Failed to generate asset URL")
  }
  
  return url
}

export const transferImageToS3 = async (imageUrl: string, key: string): Promise<string> => {
  if (!isAwsConfigured() || !s3Client) {
    throw new Error("AWS S3 is not configured")
  }

  try {
    // Download the image from the URL
    const response = await fetch(imageUrl)
    const arrayBuffer = await response.arrayBuffer()

    // Prepare the parameters for uploading to S3
    const params = {
      Bucket: process.env.AWS_BUCKET_PUBLIC,
      Key: key,
      Body: Buffer.from(arrayBuffer),
      ContentType: response.headers.get("content-type") || "application/octet-stream",
      ContentLength: parseInt(response.headers.get("content-length") || "0", 10),
    }

    // Upload the image to the S3 bucket
    const putCommand = new PutObjectCommand(params)
    
    await s3Client.send(putCommand)

    // Get the URL
    const publicUrl = getAssetUrl(key)
    if (!publicUrl) {
      throw new Error("Failed to generate asset URL")
    }

    return publicUrl
  } catch (error) {
    throw new Error("Error uploading image to S3: " + error)
  }
}

// Helper function to convert a Readable stream to a string
export const streamToString = (stream: Readable): Promise<string> => {
  const chunks: unknown[] = []
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk))
    stream.on("end", () => resolve(Buffer.concat(chunks as Buffer[]).toString("utf8")))
    stream.on("error", reject)
  })
}

/**
 * Read a JSON file from S3 (private data bucket)
 * @param key The S3 object key (path + filename)
 * @returns The parsed JSON object
 */
export async function readJsonFromS3(key: string): Promise<unknown> {
  console.log(`[readJsonFromS3] Attempting to read key: ${key}`);
  const bucket = process.env.bucketData || process.env.AWS_BUCKET_DATA;
  if (!bucket) {
    throw new Error("AWS_BUCKET_DATA is not set");
  }
  if (!isAwsConfigured() || !s3Client) {
    throw new Error("AWS S3 is not configured");
  }
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error("No file body returned from S3");
    }
    // Convert stream to string
    const jsonString = await streamToString(response.Body as Readable);
    try {
      // Parse and return JSON
      return JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse JSON from S3:", {
        key,
        jsonString,
        parseError,
      });
      throw new Error(`Invalid JSON in S3 object: ${key}`);
    }
  } catch (error) {
    throw new Error(`Error reading JSON from S3: ${error}`);
  }
}