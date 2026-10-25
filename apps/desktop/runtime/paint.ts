import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { PNG } from "pngjs"
import { runBounded } from "../../desktop-spike/harness/cli.mjs"
import { imageCommand, imageOutput } from "../../desktop-spike/harness/image-cli.mjs"
import type { Hero } from "./heroes"

// The spike's JavaScript process runner, typed for the options used here.
const run = runBounded as (
  binary: string,
  args: string[],
  options?: { cwd?: string; input?: string; env?: Record<string, string | undefined>; timeout?: number; limit?: number }
) => Promise<{ code: number | null; stdout: string; timedOut: boolean; oversized: boolean }>

// Painting a hero's standee through the player's own image-capable CLI, under their own sign-in. One image holds the
// front and back side by side. It is keyed and split here, and the portrait is cropped from the front, so the faces match.
export const PAINTERS = ["grok", "codex"] as const
export type Painter = (typeof PAINTERS)[number]
export type Art = { front: Buffer; back: Buffer; portrait: Buffer }
const KINDS = ["front", "back", "portrait"] as const
const PORTRAIT_BG = [0x3b, 0x42, 0x56]
// The share of figure height a portrait frames around the head.
const HEAD: Record<string, number> = { Dwarf: 0.17, Halfling: 0.19, Gnome: 0.22 }

export function paintPrompt(provider: Painter, hero: Pick<Hero, "name" | "race" | "archetype" | "gender" | "appearance">) {
  return `Use only your built-in ${provider === "codex" ? "image generation" : "image_gen"} tool exactly once to generate one landscape image. Do not use any other tools or write files yourself. Then stop.

One landscape character sheet with two full-body views of the SAME character side by side: the front view on the left, and on the right the back view seen from directly behind, with no face visible. Matching scale, outfit and relaxed standing pose. Both figures head to toe with feet visible, a clear gap between them and around every edge. No base, no ground, no cast shadow, no text, no labels, no border.

Character: ${hero.name}, ${[hero.gender, hero.race, hero.archetype].filter(Boolean).join(" ")}. ${hero.appearance}

Style: a finished painted fantasy character illustration, stylized-realistic, with visible oil-painting brushwork and a carefully painted, expressive face. Muted earthy palette of umber, ochre, dusty navy, olive and sage. Soft neutral daylight from the upper left. No outline, no rim light. Not photorealistic, not cartoon, not chibi, not a 3D render.
Background: flat, perfectly solid bright green #00ff00 everywhere, edge to edge, with no gradient.`
}

export async function paint(provider: Painter, hero: Hero, cwd: string): Promise<Art> {
  const command = imageCommand(provider, cwd, paintPrompt(provider, hero), "standee")
  const result = await run(command.executable, command.args, { cwd, env: command.env, input: command.input, timeout: 300_000, limit: 8_388_608 })
  if (result.code !== 0 || result.timedOut || result.oversized) throw new Error(`${provider} could not paint ${hero.name}. Check its sign-in or usage limit, then retry.`)
  const events = result.stdout.split("\n").flatMap((line: string) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
  let path: string
  try {
    path = imageOutput(provider, events)
  } catch {
    throw new Error(`${provider} did not return a picture of ${hero.name}. Retry.`)
  }
  if (!path.toLowerCase().endsWith(".png")) {
    const converted = join(cwd, "standee.png")
    if ((await run("/usr/bin/sips", ["-s", "format", "png", path, "--out", converted])).code !== 0) throw new Error("The painted picture could not be read.")
    path = converted
  }
  return cutStandee(PNG.sync.read(readFileSync(path)), hero.race)
}

// Painted art lives beside the save, by hero id. Deleting a hero keeps it, so a running adventure keeps its faces.
export const artDir = (data: string, id: string) => join(data, "art", id.replace(/[^a-z0-9-]/g, ""))
export function storeArt(data: string, id: string, art: Art) {
  const dir = artDir(data, id)
  mkdirSync(dir, { recursive: true })
  for (const kind of KINDS) writeFileSync(join(dir, `${kind}.png`), art[kind])
}
export function readArt(data: string, ids: string[]) {
  return Object.fromEntries(
    ids.flatMap((id) => {
      const dir = artDir(data, id)
      if (!KINDS.every((k) => existsSync(join(dir, `${k}.png`)))) return []
      return [[id, Object.fromEntries(KINDS.map((k) => [k, `data:image/png;base64,${readFileSync(join(dir, `${k}.png`)).toString("base64")}`]))]]
    })
  ) as Record<string, Record<(typeof KINDS)[number], string>>
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
// Removes the backdrop by flooding in from the border through colours near the border's own, so a figure's greens
// survive and a CLI that ignores the green screen still works. Then splits front from back at the emptiest column.
export function cutStandee(png: PNG, race: string): Art {
  const { width: W, height: H, data } = png
  const border: number[][] = []
  for (let x = 0; x < W; x += 4) border.push([...data.subarray(x * 4, x * 4 + 3)], [...data.subarray(((H - 1) * W + x) * 4, ((H - 1) * W + x) * 4 + 3)])
  for (let y = 0; y < H; y += 4) border.push([...data.subarray(y * W * 4, y * W * 4 + 3)], [...data.subarray((y * W + W - 1) * 4, (y * W + W - 1) * 4 + 3)])
  const bg = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1])
  const dist = new Float32Array(W * H)
  for (let p = 0; p < W * H; p++) dist[p] = Math.hypot(data[p * 4] - bg[0], data[p * 4 + 1] - bg[1], data[p * 4 + 2] - bg[2])
  const outside = new Uint8Array(W * H)
  const queue: number[] = []
  const visit = (p: number) => {
    if (!outside[p] && dist[p] < 95) {
      outside[p] = 1
      queue.push(p)
    }
  }
  for (let x = 0; x < W; x++) {
    visit(x)
    visit((H - 1) * W + x)
  }
  for (let y = 0; y < H; y++) {
    visit(y * W)
    visit(y * W + W - 1)
  }
  // A green screen also shows through gaps the border cannot reach, such as between an arm and the body.
  const green = bg[1] > bg[0] + 40 && bg[1] > bg[2] + 40
  if (green) for (let p = 0; p < W * H; p++) if (dist[p] < 30) visit(p)
  while (queue.length) {
    const p = queue.pop()!
    const x = p % W
    if (x > 0) visit(p - 1)
    if (x < W - 1) visit(p + 1)
    if (p >= W) visit(p - W)
    if (p < (H - 1) * W) visit(p + W)
  }
  let alpha = new Uint8Array(W * H)
  let clear = 0
  for (let p = 0; p < W * H; p++) {
    alpha[p] = outside[p] ? Math.round(255 * smooth(35, 95, dist[p])) : 255
    if (alpha[p] === 0) clear++
  }
  if (clear / (W * H) < 0.2) throw new Error("The painted picture has no clear background. Paint again.")
  if (clear / (W * H) > 0.95) throw new Error("The painted picture has no figure in it. Paint again.")
  // Erode one pixel to drop the fringe, then pull backdrop spill out of the edge.
  const eroded = alpha.slice()
  for (let p = 0; p < W * H; p++) {
    const x = p % W
    if (alpha[p] && (x === 0 || x === W - 1 || p < W || p >= (H - 1) * W || !alpha[p - 1] || !alpha[p + 1] || !alpha[p - W] || !alpha[p + W])) eroded[p] = 0
  }
  alpha = eroded
  // Green spill reaches a few pixels into hair and soft edges: neutralise it within a 3 px band of the cut.
  let band = Uint8Array.from(alpha, (a) => (a < 255 ? 1 : 0))
  for (let pass = 0; pass < 3 && green; pass++) {
    const next = band.slice()
    for (let p = 0; p < W * H; p++) {
      const x = p % W
      if (!band[p] && ((x > 0 && band[p - 1]) || (x < W - 1 && band[p + 1]) || (p >= W && band[p - W]) || (p < (H - 1) * W && band[p + W]))) next[p] = 1
    }
    band = next
  }
  for (let p = 0; p < W * H; p++) {
    data[p * 4 + 3] = alpha[p]
    if (green && band[p]) data[p * 4 + 1] = Math.min(data[p * 4 + 1], Math.max(data[p * 4], data[p * 4 + 2]))
  }
  const columns = new Uint32Array(W)
  for (let p = 0; p < W * H; p++) if (alpha[p] > 40) columns[p % W]++
  let split = W >> 1
  for (let x = Math.round(W * 0.3); x < Math.round(W * 0.7); x++) if (columns[x] < columns[split]) split = x
  const front = crop(png, 0, split)
  const back = crop(png, split, W)
  return { front: PNG.sync.write(front), back: PNG.sync.write(back), portrait: PNG.sync.write(portrait(front, HEAD[race] ?? 0.13)) }
}

// The figure between two columns, cropped to its bounds with a little margin.
function crop(png: PNG, from: number, to: number) {
  const { width: W, height: H, data } = png
  let [minX, minY, maxX, maxY] = [to, H, from, 0]
  for (let y = 0; y < H; y++)
    for (let x = from; x < to; x++)
      if (data[(y * W + x) * 4 + 3] > 40) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
  if (maxX <= minX || maxY - minY < H * 0.3) throw new Error("The painted picture did not show the whole figure. Paint again.")
  const pad = 6
  const left = Math.max(from, minX - pad)
  const top = Math.max(0, minY - pad)
  const out = new PNG({ width: Math.min(to, maxX + pad + 1) - left, height: Math.min(H, maxY + pad + 1) - top })
  PNG.bitblt(png, out, left, top, out.width, out.height, 0, 0)
  return out
}

// Head and shoulders from the front, centred on the head, on the HUD's dusk blue, 512 px wide.
function portrait(front: PNG, head: number) {
  const { width: W, height: H, data } = front
  let [sum, weight] = [0, 0]
  for (let y = 0; y < Math.round(H * head * 0.8); y++)
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3]
      sum += a * x
      weight += a
    }
  const h = Math.round(H * head * 2.3)
  const w = Math.round(h * 1.27)
  const left = Math.round(sum / Math.max(weight, 1) - w / 2)
  const top = -Math.round(H * 0.02)
  // Each source pixel flattened onto the backdrop, outside the figure's bounds included.
  const at = (x: number, y: number, c: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return PORTRAIT_BG[c]
    const a = data[(y * W + x) * 4 + 3] / 255
    return data[(y * W + x) * 4 + c] * a + PORTRAIT_BG[c] * (1 - a)
  }
  const out = new PNG({ width: 512, height: Math.round((512 * h) / w) })
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < 512; x++) {
      const fx = left + ((x + 0.5) * w) / 512 - 0.5
      const fy = top + ((y + 0.5) * h) / out.height - 0.5
      const [x0, y0] = [Math.floor(fx), Math.floor(fy)]
      const [tx, ty] = [fx - x0, fy - y0]
      for (let c = 0; c < 3; c++) {
        const v = (at(x0, y0, c) * (1 - tx) + at(x0 + 1, y0, c) * tx) * (1 - ty) + (at(x0, y0 + 1, c) * (1 - tx) + at(x0 + 1, y0 + 1, c) * tx) * ty
        out.data[(y * 512 + x) * 4 + c] = Math.round(v)
      }
      out.data[(y * 512 + x) * 4 + 3] = 255
    }
  return out
}
