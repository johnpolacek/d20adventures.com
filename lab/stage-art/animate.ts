// Spike (c): a looping idle video for a standee. The still front goes on green, a video model animates it with the same
// first and last frame so it loops, every frame is keyed like a standee, and colour and alpha are packed side by side in
// one H.264 video, which WebKit (the desktop app) and Chrome both play.
//
//   node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/animate.ts prep [castId]
//   ... animate.ts video h3|veo [castId]                    raw/<id>-<model>.mp4
//   ... animate.ts key <file in raw> [ranges] [castId]      public/stage-lab/<id>-idle.mp4, .json and -still.webp
//
// `ranges` picks frames, e.g. 112-122,0-34, for a clip that cut away mid-shot; a loop of picked frames plays forward and back.

import { execFileSync } from "node:child_process"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { dataUri, dirs, fal, fetchBuffer, PUB, RAW, smooth, veo } from "./gen"

const FIGURES: Record<string, { front: string; motion: string }> = {
  thalbern: {
    front: "public/stage/fixtures/the-midnight-summons/thalbern-front.webp",
    motion:
      "He stands in place, alert and calm. Slow natural idle motion only: his chest rises and falls with his breath, he shifts his weight a little from one foot to the other, blinks, glances slightly to one side and back, his hand resting near his sword. His hair moves very slightly.",
  },
}
const W = 1152
const H = 2048

async function prep(id: string) {
  const f = FIGURES[id]
  const fig = await sharp(await fetchBuffer(f.front))
    .resize({ height: Math.round(H * 0.9) })
    .toBuffer({ resolveWithObject: true })
  const left = Math.round((W - fig.info.width) / 2)
  const top = H - Math.round(H * 0.02) - fig.info.height
  await sharp({ create: { width: W, height: H, channels: 3, background: "#00ff00" } })
    .composite([{ input: fig.data, left, top }])
    .png()
    .toFile(`${RAW}/${id}-green.png`)
  console.log(`${id}: green input ${W}x${H}`)
}

async function video(id: string, model: string) {
  const f = FIGURES[id]
  const png = await readFile(`${RAW}/${id}-green.png`)
  const prompt = `A single continuous shot in a green-screen studio, for compositing into a game. ${f.motion}

One shot, no cuts, no scene change. Locked-off static camera: no zoom, no pan, no camera shake. He stays the same size and in the same place in the frame, his feet planted. The background is a flat, evenly lit, pure green (#00FF00) screen in every frame, from the first to the last: no sky, no landscape, no shadow, no floor. Keep the painted art style, the colours and the costume exactly as they are: no cloak, no cape, nothing added. No text.`
  const file = `${RAW}/${id}-${model}.mp4`
  if (model === "veo") {
    await writeFile(file, await veo(`${id} idle`, "veo-3.1-fast-generate-preview", prompt, png, png, { aspectRatio: "9:16", durationSeconds: 8, resolution: "1080p" }))
  } else {
    const img = dataUri(png)
    const out = await fal<{ video: { url: string } }>(`${id} idle`, "minimax/h3/image-to-video", {
      prompt,
      image_url: img,
      end_image_url: img,
      duration: 5,
      resolution: "2K",
      prompt_expansion_mode: "disabled",
    })
    await writeFile(file, await fetchBuffer(out.video.url))
  }
  console.log(`${id}: ${file}`)
}

const probe = (file: string) => {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "json", file]).toString())
  const s = j.streams[0]
  const [a, b] = String(s.r_frame_rate).split("/").map(Number)
  return { width: s.width as number, height: s.height as number, fps: a / (b || 1), frames: Number(s.nb_frames) }
}

// The standee key: distance from green, a two-pixel erode, green spill pulled down to the larger of red and blue.
function keyFrame(data: Buffer, W: number, H: number) {
  const alpha = new Uint8Array(W * H)
  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    alpha[p] = Math.round(255 * (1 - smooth(45, 125, data[i + 1] - Math.max(data[i], data[i + 2]))))
  }
  let a = alpha
  for (let pass = 0; pass < 2; pass++) {
    const src = a
    a = new Uint8Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let m = src[y * W + x]
        for (let dy = -1; dy <= 1 && m; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            m = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : Math.min(m, src[yy * W + xx])
          }
        a[y * W + x] = m
      }
  }
  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    data[i + 3] = a[p]
    if (a[p] < 250) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]))
  }
  return data
}

async function key(id: string, file: string, ranges?: string) {
  const src = `${RAW}/${file}`
  const info = probe(src)
  const dir = `${RAW}/${id}-frames`
  await rm(dir, { recursive: true, force: true })
  await mkdir(`${dir}/in`, { recursive: true })
  await mkdir(`${dir}/out`, { recursive: true })
  execFileSync("ffmpeg", ["-v", "error", "-i", src, `${dir}/in/%04d.png`])
  const all = (await readdir(`${dir}/in`)).filter((f) => f.endsWith(".png")).sort()
  let files: string[]
  if (ranges) {
    const picked = ranges.split(",").flatMap((r) => {
      const [a, b] = r.split("-").map(Number)
      return all.slice(a, b + 1)
    })
    files = [...picked, ...picked.slice(1, -1).reverse()]
  } else {
    // The last frame repeats the first (both were given as keyframes): drop it so the loop does not stutter.
    files = all.slice(0, -1)
  }
  const keyed: Buffer[] = []
  const cache = new Map<string, Buffer>()
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, 0, 0]
  for (const f of files) {
    const hit = cache.get(f)
    if (hit) {
      keyed.push(hit)
      continue
    }
    const { data, info: fi } = await sharp(`${dir}/in/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    cache.set(f, data)
    keyFrame(data, fi.width, fi.height)
    for (let p = 0; p < fi.width * fi.height; p++)
      if (data[p * 4 + 3] > 40) {
        const x = p % fi.width
        const y = (p - x) / fi.width
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    keyed.push(data)
  }
  // One crop for every frame: the figure's reach over the whole clip, padded like a still standee. Even sizes for H.264.
  const pad = 6
  const left = Math.max(0, minX - pad)
  const top = Math.max(0, minY - pad)
  const cw = Math.min(info.width - left, maxX - minX + 2 * pad) & ~1
  const ch = Math.min(info.height - top, maxY - minY + 2 * pad) & ~1
  for (let n = 0; n < keyed.length; n++) {
    const frame = sharp(keyed[n], { raw: { width: info.width, height: info.height, channels: 4 } }).extract({ left, top, width: cw, height: ch })
    const rgba = await frame.raw().toBuffer()
    const colour = Buffer.alloc(cw * ch * 3)
    const matte = Buffer.alloc(cw * ch * 3)
    for (let p = 0; p < cw * ch; p++) {
      for (let c = 0; c < 3; c++) colour[p * 3 + c] = rgba[p * 4 + c]
      matte[p * 3] = matte[p * 3 + 1] = matte[p * 3 + 2] = rgba[p * 4 + 3]
    }
    await sharp({ create: { width: cw * 2, height: ch, channels: 3, background: "#000" } })
      .composite([
        { input: colour, raw: { width: cw, height: ch, channels: 3 }, left: 0, top: 0 },
        { input: matte, raw: { width: cw, height: ch, channels: 3 }, left: cw, top: 0 },
      ])
      .png()
      .toFile(`${dir}/out/${String(n + 1).padStart(4, "0")}.png`)
  }
  const out = `${PUB}/${id}-idle.mp4`
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-framerate",
    String(info.fps),
    "-i",
    `${dir}/out/%04d.png`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "18",
    "-preset",
    "slow",
    "-movflags",
    "+faststart",
    out,
  ])
  // A still from the first keyed frame, for the card's normal map and the paint filter's mask.
  await sharp(keyed[0], { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left, top, width: cw, height: ch })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`${PUB}/${id}-idle-still.webp`)
  await writeFile(`${PUB}/${id}-idle.json`, JSON.stringify({ width: cw, height: ch, fps: info.fps, frames: keyed.length, source: { width: info.width, height: info.height } }, null, 1))
  console.log(`${id}: ${keyed.length} frames at ${info.fps} fps, ${cw}x${ch} each, ${out}`)
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const id = rest.find((a) => FIGURES[a]) ?? "thalbern"
  await dirs()
  if (cmd === "prep") await prep(id)
  else if (cmd === "video") await video(id, rest[0] === "veo" ? "veo" : "h3")
  else if (cmd === "key") await key(id, rest[0], rest[1] && !FIGURES[rest[1]] ? rest[1] : undefined)
  else console.log("usage: animate.ts prep [castId] | video h3|veo [castId] | key <raw file> [ranges] [castId]")
}
void main()
