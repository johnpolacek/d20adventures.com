import { randomUUID } from "node:crypto"
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { z } from "zod"
import { s3Client } from "@/lib/aws"

// Server only. Feedback lives in the private data bucket: each note as a JSON file, its screenshots beside it.
// Nothing here is public. The admin page reads screenshots through links that expire.

const SCREENSHOTS_PER_DAY = 30
const NOTES_PER_DAY = 50
const DAY_MS = 24 * 60 * 60 * 1000
const LINK_SECONDS = 15 * 60

function store() {
  const Bucket = process.env.AWS_BUCKET_DATA
  if (!s3Client || !Bucket) throw new Error("Feedback storage is not configured.")
  return { s3: s3Client, Bucket }
}

// Keys are built here from the signed-in account and a random id. Nothing a player types reaches a key.
const account = (userId: string) => userId.replace(/[^A-Za-z0-9_]/g, "")
const screenshotPrefix = (userId: string, at = Date.now()) => `feedback/screenshots/${account(userId)}/${new Date(at).toISOString().slice(0, 10)}/`
const screenshotKey = (userId: string) => new RegExp(`^feedback/screenshots/${account(userId)}/\\d{4}-\\d{2}-\\d{2}/[0-9a-f-]{36}\\.jpg$`)

// S3 lists keys in ascending order. A note's key starts with the time left until a far instant, so the newest list first.
const RECORDS = "feedback/records/"
const FAR = 9_999_999_999_999
const recordKey = (userId: string, at: number) => `${RECORDS}${String(FAR - at).padStart(13, "0")}-${account(userId)}-${randomUUID()}.json`
const writtenAt = (key: string) => FAR - Number(key.slice(RECORDS.length, RECORDS.length + 13))

/** Whether bytes begin as a JPEG file does. The request's content type is not trusted. */
export const isJpeg = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

/** Stores a player's shrunk screenshot, or refuses once they have sent a day's worth. */
export async function saveScreenshot(userId: string, bytes: Uint8Array): Promise<{ key: string } | { limited: true }> {
  const { s3, Bucket } = store()
  const Prefix = screenshotPrefix(userId)
  const today = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, MaxKeys: SCREENSHOTS_PER_DAY }))
  if ((today.KeyCount ?? 0) >= SCREENSHOTS_PER_DAY) return { limited: true }
  const Key = `${Prefix}${randomUUID()}.jpg`
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: bytes, ContentType: "image/jpeg" }))
  return { key: Key }
}

/** Whether a key is a screenshot this player uploaded: theirs by its path, and present. */
export async function ownsScreenshot(userId: string, key: string) {
  if (!screenshotKey(userId).test(key)) return false
  const { s3, Bucket } = store()
  return s3.send(new HeadObjectCommand({ Bucket, Key: key })).then(
    () => true,
    () => false
  )
}

const recordSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  userId: z.string(),
  source: z.enum(["web", "desktop"]),
  kind: z.enum(["general", "ending"]),
  message: z.string(),
  rating: z.number().optional(),
  bestMoment: z.string().optional(),
  broke: z.string().optional(),
  screenshots: z.array(z.string()),
  context: z.record(z.string(), z.string()),
})
export type FeedbackRecord = z.infer<typeof recordSchema>

/** Stores a note, or refuses once the player has sent a day's worth. */
export async function saveFeedback(feedback: Omit<FeedbackRecord, "id" | "createdAt">): Promise<{ id: string } | { limited: true }> {
  const { s3, Bucket } = store()
  const now = Date.now()
  // The newest thousand notes cover the last day at any size this playtest reaches.
  const recent = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: RECORDS, MaxKeys: 1000 }))
  const mine = (recent.Contents ?? []).filter((o) => o.Key?.includes(`-${account(feedback.userId)}-`) && now - writtenAt(o.Key) < DAY_MS)
  if (mine.length >= NOTES_PER_DAY) return { limited: true }
  const Key = recordKey(feedback.userId, now)
  const record: FeedbackRecord = { ...feedback, id: Key.slice(RECORDS.length, -".json".length), createdAt: now }
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: JSON.stringify(record), ContentType: "application/json" }))
  return { id: record.id }
}

/** The newest notes for the admin page, each screenshot as a link that expires. */
export async function listFeedback(limit = 100) {
  const { s3, Bucket } = store()
  const listed = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: RECORDS, MaxKeys: limit }))
  const records = await Promise.all(
    (listed.Contents ?? []).map(async ({ Key }) => {
      try {
        const file = await s3.send(new GetObjectCommand({ Bucket, Key }))
        const record = recordSchema.parse(JSON.parse((await file.Body?.transformToString()) ?? ""))
        const screenshotUrls = await Promise.all(record.screenshots.map((shot) => getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: shot }), { expiresIn: LINK_SECONDS })))
        return { ...record, screenshotUrls }
      } catch (error) {
        console.error("[feedback] unreadable record", Key, error)
        return null
      }
    })
  )
  return records.filter((record) => record !== null)
}
