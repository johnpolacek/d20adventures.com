// One-off: generate portraits for the March of Davos premade companions and
// upload them to the public S3 bucket, mirroring the covert-cargo pcs layout.
// Uses the same Gemini image model as the encounter standee pipeline.
// Run: node --env-file=.env --env-file=.env.local --import tsx scripts/generate-march-companion-portraits.ts
// Then paste the printed URLs into the companion .json sheets and .md profiles.

import { readFileSync } from "node:fs"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { AWS_BUCKET_PUBLIC, s3Client } from "@/lib/aws"

const MODEL_ID = "gemini-3.1-flash-image"

const COMPANION_IDS = ["branka-stoneveil", "milos-radan", "yeva-softstep", "cassia-verane", "wrenna-faelendar", "ilya-veles"]

const STYLE =
  "Painted cinematic dark-fantasy character portrait, waist-up, dramatic lighting, detailed face looking toward the viewer, medieval frontier city festival backdrop softly out of focus. NOT cartoon, NOT chibi. No text, no watermark, no border, no logo. One character only. Landscape composition."

async function generatePortrait(prompt: string): Promise<Buffer> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
    }),
  })
  if (!response.ok) {
    throw new Error(`portrait render failed: ${response.status} ${(await response.text()).slice(0, 300)}`)
  }
  const body = (await response.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[] }
  for (const part of body.candidates?.[0]?.content?.parts ?? []) {
    const data = part.inlineData?.data ?? part.inline_data?.data
    if (data) return Buffer.from(data, "base64")
  }
  throw new Error("portrait render returned no image")
}

async function main() {
  if (!s3Client) throw new Error("S3 client not initialized — check AWS env vars")

  // Optional: pass companion ids as args to regenerate only those.
  const requested = process.argv.slice(2)
  const ids = requested.length > 0 ? COMPANION_IDS.filter((id) => requested.includes(id)) : COMPANION_IDS

  for (const id of ids) {
    const sheet = JSON.parse(readFileSync(`content/settings/realm-of-myr/adventures/march-of-davos/characters/${id}.json`, "utf8")) as {
      name: string
      gender?: string
      race: string
      archetype: string
      appearance: string
    }
    const prompt = `${STYLE}\n\nCharacter: ${sheet.gender ?? ""} ${sheet.race} ${sheet.archetype} named ${sheet.name}. ${sheet.appearance}`
    console.log(`Generating portrait for ${sheet.name}...`)

    const image = await generatePortrait(prompt)
    const key = `images/settings/realm-of-myr/march-of-davos/pcs/${id}.png`
    await s3Client.send(
      new PutObjectCommand({
        Bucket: AWS_BUCKET_PUBLIC,
        Key: key,
        Body: image,
        ContentType: "image/png",
      })
    )
    const url = `https://${AWS_BUCKET_PUBLIC}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}?t=${Date.now()}`
    console.log(`  ${id}: ${url}`)
  }

  console.log("Done. Update the image fields in the companion .json and .md files with the URLs above.")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
