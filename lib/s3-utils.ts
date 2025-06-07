import { GetObjectCommand,PutObjectCommand, CopyObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
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

export async function updateJsonOnS3(key: string, data: unknown): Promise<void> {
  const bucket = process.env.bucketData || process.env.AWS_BUCKET_DATA;
  if (!bucket) {
    throw new Error("AWS_BUCKET_DATA is not set");
  }
  if (!isAwsConfigured() || !s3Client) {
    throw new Error("AWS S3 is not configured");
  }
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    });
    await s3Client.send(command);
  } catch (error) {
    console.error("Error updating JSON on S3:", { key, error });
    throw new Error(`Error updating JSON on S3: ${error}`);
  }
}

export async function copyS3Object(sourceKey: string, destinationKey: string): Promise<void> {
  const bucket = process.env.bucketData || process.env.AWS_BUCKET_DATA;
  if (!bucket) {
    throw new Error("AWS_BUCKET_DATA is not set");
  }
  if (!isAwsConfigured() || !s3Client) {
    throw new Error("AWS S3 is not configured");
  }

  try {
    const command = new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey}`,
      Key: destinationKey,
    });
    await s3Client.send(command);
    console.log(`Successfully copied ${sourceKey} to ${destinationKey}`);
  } catch (error) {
    console.error("Error copying S3 object:", { sourceKey, destinationKey, error });
    throw new Error(`Error copying S3 object: ${error}`);
  }
}

/**
 * List and read all .json files within a given directory on S3 (private data bucket)
 * @param directoryPrefix The directory prefix (e.g., "adventures/" or "templates/")
 * @param exclude Optional array of filenames to exclude (e.g., ["setting-data.json"])
 * @returns Array of objects with key and parsed JSON data
 */
export async function listAndReadJsonFilesInS3Directory(
  directoryPrefix: string, 
  exclude: string[] = []
): Promise<Array<{ key: string; data: unknown }>> {
  const bucket = process.env.bucketData || process.env.AWS_BUCKET_DATA;
  if (!bucket) {
    throw new Error("AWS_BUCKET_DATA is not set");
  }
  if (!isAwsConfigured() || !s3Client) {
    throw new Error("AWS S3 is not configured");
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: directoryPrefix,
    });

    const response = await s3Client.send(command);
    
    if (!response.Contents) {
      return [];
    }

    // Filter for .json files and exclude specified files
    const jsonFiles = response.Contents
      .filter(object => {
        if (!object.Key || !object.Key.endsWith('.json')) {
          return false;
        }
        
        // Only include files in the top level of the directory (no subdirectories)
        const relativePath = object.Key.replace(directoryPrefix, '');
        if (relativePath.includes('/')) {
          return false; // Skip files in subdirectories
        }
        
        // Extract filename from the full key
        const filename = object.Key.split('/').pop() || '';
        return !exclude.includes(filename);
      })
      .map(object => object.Key!)
      .sort();

    // Read the content of each JSON file
    const results = await Promise.all(
      jsonFiles.map(async (key) => {
        try {
          const data = await readJsonFromS3(key);
          return { key, data };
        } catch (error) {
          console.error(`Error reading JSON file ${key}:`, error);
          throw new Error(`Failed to read JSON file ${key}: ${error}`);
        }
      })
    );

    return results;
  } catch (error) {
    console.error("Error listing and reading JSON files from S3:", { directoryPrefix, error });
    throw new Error(`Error listing and reading JSON files from S3: ${error}`);
  }
}