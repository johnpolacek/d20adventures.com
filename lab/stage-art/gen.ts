// Calls shared by the stage art spikes: Gemini and GPT image models, and fal-hosted video. Keys come from the env and are
// never printed. Raw outputs go to lab/stage-art/raw (ignored by git); what the lab viewer loads goes to public/stage-lab.

import { appendFile, mkdir, readFile } from "node:fs/promises"
import sharp from "sharp"

export const RAW = "lab/stage-art/raw"
export const PUB = "public/stage-lab"
export const ART = {
  stones: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-midnight-summons/meeting-at-the-stones.png",
}

export async function dirs() {
  await mkdir(RAW, { recursive: true })
  await mkdir(PUB, { recursive: true })
}

export async function log(line: string) {
  await appendFile(`${RAW}/generations.log`, `${new Date().toISOString()} ${line}\n`)
}

const secret = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}
const scrub = (text: string, key: string) => text.slice(0, 400).replaceAll(key, "***")

export async function fetchBuffer(src: string) {
  if (!/^https?:/.test(src)) return readFile(src)
  const res = await fetch(src)
  if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// JPEG for a model's reference input, at most `max` px on the long side.
export async function jpeg(src: string | Buffer, max = 2048) {
  const buf = typeof src === "string" ? await fetchBuffer(src) : src
  return sharp(buf).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).flatten({ background: "#000" }).jpeg({ quality: 90 }).toBuffer()
}

type Aspect = "1:1" | "3:2" | "2:3" | "16:9" | "9:16" | "21:9" | "4:3" | "3:4"

export async function gemini(label: string, model: string, text: string, images: Buffer[], aspect: Aspect, size: "1K" | "2K" | "4K" = "2K") {
  const key = secret("GOOGLE_GENERATIVE_AI_API_KEY")
  const body = JSON.stringify({
    contents: [{ parts: [{ text }, ...images.map((b) => ({ inline_data: { mime_type: "image/jpeg", data: b.toString("base64") } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: size } },
  })
  const call = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body })
  let res = await call()
  for (let tries = 0; (res.status === 429 || res.status === 503) && tries < 5; tries++) {
    console.log(`${label}: HTTP ${res.status}, retrying`)
    await new Promise((r) => setTimeout(r, 10_000 * (tries + 1)))
    res = await call()
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${scrub(await res.text(), key)}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[] }
  const data = json.candidates?.[0]?.content?.parts?.map((p) => p.inlineData?.data ?? p.inline_data?.data).find(Boolean)
  if (!data) throw new Error(`${label}: no image in the response`)
  await log(`${label} ${model} ${aspect} ${size}`)
  return Buffer.from(data, "base64")
}

// GPT image edit: the first image is the one to repaint, the rest are references.
export async function gptEdit(label: string, model: string, text: string, images: Buffer[], size: string) {
  const key = secret("OPENAI_API_KEY")
  const form = new FormData()
  form.set("model", model)
  form.set("prompt", text)
  form.set("size", size)
  form.set("quality", "high")
  for (const [i, b] of images.entries()) form.append("image[]", new Blob([new Uint8Array(b)], { type: "image/jpeg" }), `image-${i}.jpg`)
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form })
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${scrub(await res.text(), key)}`)
  const json = (await res.json()) as { data?: { b64_json?: string }[] }
  const data = json.data?.[0]?.b64_json
  if (!data) throw new Error(`${label}: no image in the response`)
  await log(`${label} ${model} ${size}`)
  return Buffer.from(data, "base64")
}

// A fal queue job: submit, poll until done, return the result. Images go in as data URIs.
export async function fal<T>(label: string, endpoint: string, input: Record<string, unknown>) {
  const key = secret("FAL_KEY")
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" }
  const sub = await fetch(`https://queue.fal.run/${endpoint}`, { method: "POST", headers, body: JSON.stringify(input) })
  if (!sub.ok) throw new Error(`${label}: HTTP ${sub.status} ${scrub(await sub.text(), key)}`)
  const { status_url, response_url } = (await sub.json()) as { status_url: string; response_url: string }
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const s = (await (await fetch(status_url, { headers })).json()) as { status: string }
    if (i % 6 === 0) console.log(`${label}: ${s.status}`)
    if (s.status === "COMPLETED") break
    if (s.status !== "IN_QUEUE" && s.status !== "IN_PROGRESS") throw new Error(`${label}: ${s.status}`)
  }
  const res = await fetch(response_url, { headers })
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${scrub(await res.text(), key)}`)
  await log(`${label} ${endpoint}`)
  return (await res.json()) as T
}

// Veo through the Gemini API: a long-running job from a first frame and, optionally, a last frame. Returns the MP4.
export async function veo(label: string, model: string, prompt: string, first: Buffer, last: Buffer | null, parameters: Record<string, unknown>) {
  const key = secret("GOOGLE_GENERATIVE_AI_API_KEY")
  const headers = { "Content-Type": "application/json", "x-goog-api-key": key }
  const image = (b: Buffer) => ({ bytesBase64Encoded: b.toString("base64"), mimeType: "image/png" })
  const body = JSON.stringify({ instances: [{ prompt, image: image(first), ...(last ? { lastFrame: image(last) } : {}) }], parameters })
  const sub = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`, { method: "POST", headers, body })
  if (!sub.ok) throw new Error(`${label}: HTTP ${sub.status} ${scrub(await sub.text(), key)}`)
  const { name } = (await sub.json()) as { name: string }
  type Op = { done?: boolean; error?: unknown; response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[]; raiMediaFilteredReasons?: string[] } } }
  let op: Op = {}
  for (let i = 0; i < 120 && !op.done; i++) {
    await new Promise((r) => setTimeout(r, 10_000))
    op = (await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, { headers })).json()) as Op
    if (i % 3 === 0) console.log(`${label}: ${op.done ? "done" : "running"}`)
  }
  if (op.error) throw new Error(`${label}: ${scrub(JSON.stringify(op.error), key)}`)
  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
  if (!uri) throw new Error(`${label}: no video ${scrub(JSON.stringify(op.response ?? op), key)}`)
  const res = await fetch(uri, { headers: { "x-goog-api-key": key } })
  if (!res.ok) throw new Error(`${label}: download HTTP ${res.status}`)
  await log(`${label} ${model}`)
  return Buffer.from(await res.arrayBuffer())
}

export const dataUri = (b: Buffer, mime = "image/png") => `data:${mime};base64,${b.toString("base64")}`

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
