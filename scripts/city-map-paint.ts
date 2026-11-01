// Paints a city map's art from its map file, so the paintings keep the layout the story needs. The outer painting
// starts from a sketch of every street and block drawn from the map file, sent with a labelled copy that says what each
// region is. Each district's close-up redraws a crop of the outer painting at more detail, so the two match.
// See wiki/plans/kordavos-city-map.md.
//
//   node --env-file=.env.local --import tsx scripts/city-map-paint.ts sketch kordavos            # sketches only
//   node --env-file=.env.local --import tsx scripts/city-map-paint.ts paint kordavos outer       # the outer painting
//   node --env-file=.env.local --import tsx scripts/city-map-paint.ts paint kordavos docks,gate-ward
//   node --env-file=.env.local --import tsx scripts/city-map-paint.ts paint kordavos all
//   node --env-file=.env.local --import tsx scripts/city-map-paint.ts paint kordavos underground   # the tunnels below
//   node --env-file=.env.local --import tsx scripts/city-map-paint.ts publish kordavos all       # webp and art.json
//
// Raw paintings, sketches and drift checks go to CITY_MAP_RAW (default: the OS temp dir). Review each before
// `publish`: a drift check draws the map file's coast, river, wall and key places in red over the painting. Painting
// skips a raw painting that exists unless --force. The API key is read from GOOGLE_GENERATIVE_AI_API_KEY.

import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import type { Box, CityMap, MapDistrict, Point } from "@/lib/citymap"

const MODEL = "gemini-3-pro-image"
const RAW = process.env.CITY_MAP_RAW ?? join(tmpdir(), "d20-city-map")
const ART_INDEX = "lib/citymap/art.json"
// The outer painting is square, wider than the frame so the land runs on past the edges.
const OUTER_SIZE = 4096
const DISTRICT_SIZE = 3072

const [command, mapId, which = "all"] = process.argv.slice(2)
const force = process.argv.includes("--force")
const map = JSON.parse(readFileSync(`content/settings/realm-of-myr/maps/${mapId}.json`, "utf8")) as CityMap & {
  walls: Array<{ path: Point[] }>
  underground?: { name: string; box: Box }
}
const outerBox: Box = [map.frame.x, map.frame.y, Math.max(map.frame.width, map.frame.height), Math.max(map.frame.width, map.frame.height)]
const L = Object.fromEntries(map.landmarks.map((l) => [l.id, l]))
const raw = (name: string) => join(RAW, `${mapId}-${name}`)
mkdirSync(RAW, { recursive: true })

async function main() {
  if (command === "sketch") await sketches()
  else if (command === "paint") {
    if (which === "outer" || which === "all") await paintOuter()
    for (const district of districtsFor(which)) await paintDistrict(district)
    if (which === "underground" || which === "all") await paintUnderground()
  } else if (command === "publish") await publish()
  else throw new Error("Usage: city-map-paint.ts sketch|paint|publish <map> [outer|all|district,...] [--force]")
}

function districtsFor(list: string) {
  if (list === "outer" || list === "underground") return []
  const ids = list === "all" ? map.districts.map((d) => d.id) : list.split(",").filter((id) => id !== "outer" && id !== "underground")
  return ids.map((id) => {
    const district = map.districts.find((d) => d.id === id)
    if (!district) throw new Error(`No district ${id}`)
    return district
  })
}

// A square box round a district, kept inside the outer painting.
function districtBox(district: MapDistrict): Box {
  const xs = district.polygon.map((p) => p[0])
  const ys = district.polygon.map((p) => p[1])
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 90
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
  return [clamp(cx - size / 2, outerBox[0], outerBox[0] + outerBox[2] - size), clamp(cy - size / 2, outerBox[1], outerBox[1] + outerBox[3] - size), size, size].map(Math.round) as Box
}

async function sketches() {
  await sharp(Buffer.from(sketchSvg(false)))
    .png()
    .toFile(raw("sketch.png"))
  await sharp(Buffer.from(sketchSvg(true)))
    .png()
    .toFile(raw("sketch-labelled.png"))
  console.log(`Sketches in ${RAW}`)
}

async function paintOuter() {
  const out = raw("outer.jpg")
  if (existsSync(out) && !force) return console.log(`outer: kept ${out}`)
  await sketches()
  const image = await paint("outer", OUTER_PROMPT, [raw("sketch.png"), raw("sketch-labelled.png")])
  await writeFile(out, image)
  await driftCheck(out, outerBox, raw("outer-drift.png"))
  console.log(`outer: ${out}, check ${raw("outer-drift.png")}`)
}

async function paintDistrict(district: MapDistrict) {
  const out = raw(`${district.id}.jpg`)
  if (existsSync(out) && !force) return console.log(`${district.id}: kept ${out}`)
  const outer = raw("outer.jpg")
  if (!existsSync(outer)) throw new Error("Paint the outer view first")
  const box = districtBox(district)
  const meta = await sharp(outer).metadata()
  const scale = meta.width! / outerBox[2]
  const crop = await sharp(outer)
    .extract({ left: Math.round((box[0] - outerBox[0]) * scale), top: Math.round((box[1] - outerBox[1]) * scale), width: Math.round(box[2] * scale), height: Math.round(box[3] * scale) })
    .png()
    .toBuffer()
  await writeFile(raw(`${district.id}-crop.png`), crop)
  const image = await paint(district.id, districtPrompt(district), [raw(`${district.id}-crop.png`)])
  await writeFile(out, image)
  await driftCheck(out, box, raw(`${district.id}-drift.png`))
  console.log(`${district.id}: ${out}, check ${raw(`${district.id}-drift.png`)}`)
}

// The tunnels below the city, from a plan of them drawn from the map file's underground places.
async function paintUnderground() {
  if (!map.underground) throw new Error(`${mapId} has no underground`)
  const out = raw("underground.jpg")
  if (existsSync(out) && !force) return console.log(`underground: kept ${out}`)
  await sharp(Buffer.from(undergroundSvg(false)))
    .png()
    .toFile(raw("underground-sketch.png"))
  await sharp(Buffer.from(undergroundSvg(true)))
    .png()
    .toFile(raw("underground-sketch-labelled.png"))
  const image = await paint("underground", UNDERGROUND_PROMPT, [raw("underground-sketch.png"), raw("underground-sketch-labelled.png")])
  await writeFile(out, image)
  console.log(`underground: ${out}, sketch ${raw("underground-sketch.png")}`)
}

async function publish() {
  const dir = `public/stage/maps/${mapId}`
  await mkdir(dir, { recursive: true })
  const index = existsSync(ART_INDEX) ? JSON.parse(await readFile(ART_INDEX, "utf8")) : {}
  const art: { outer?: { src: string; box: Box }; underground?: { src: string; box: Box }; districts: Record<string, { src: string; box: Box }> } = index[mapId] ?? {
    districts: {},
  }
  const done: string[] = []
  if ((which === "outer" || which === "all") && existsSync(raw("outer.jpg"))) {
    await sharp(raw("outer.jpg")).resize(OUTER_SIZE).webp({ quality: 80 }).toFile(`${dir}/${mapId}.webp`)
    art.outer = { src: `/stage/maps/${mapId}/${mapId}.webp`, box: outerBox }
    done.push("outer")
  }
  for (const district of districtsFor(which)) {
    if (!existsSync(raw(`${district.id}.jpg`))) continue
    await sharp(raw(`${district.id}.jpg`))
      .resize(DISTRICT_SIZE)
      .webp({ quality: 80 })
      .toFile(`${dir}/${district.id}.webp`)
    art.districts[district.id] = { src: `/stage/maps/${mapId}/${district.id}.webp`, box: districtBox(district) }
    done.push(district.id)
  }
  if ((which === "underground" || which === "all") && map.underground && existsSync(raw("underground.jpg"))) {
    await sharp(raw("underground.jpg")).resize(DISTRICT_SIZE).webp({ quality: 80 }).toFile(`${dir}/underground.webp`)
    art.underground = { src: `/stage/maps/${mapId}/underground.webp`, box: map.underground.box }
    done.push("underground")
  }
  index[mapId] = art
  await writeFile(ART_INDEX, `${JSON.stringify(index, null, 2)}\n`)
  console.log(`Published ${done.join(", ") || "nothing"} to ${dir}. Run pnpm stage:sync before pushing.`)
}

async function paint(label: string, text: string, images: string[]) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const parts = await Promise.all(images.map(async (path) => ({ inline_data: { mime_type: "image/png", data: (await sharp(path).png().toBuffer()).toString("base64") } })))
  const body = JSON.stringify({ contents: [{ parts: [{ text }, ...parts] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "4K" } } })
  const call = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body })
  let res = await call()
  // Rate limits and high demand return no image and are not billed: wait and retry.
  for (let tries = 0; (res.status === 429 || res.status === 503) && tries < 5; tries++) {
    console.log(`${label}: HTTP ${res.status}, retrying`)
    await new Promise((r) => setTimeout(r, 10_000 * (tries + 1)))
    res = await call()
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${(await res.text()).slice(0, 200).replaceAll(key, "***")}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[] }
  const data = json.candidates?.[0]?.content?.parts?.map((p) => p.inlineData?.data ?? p.inline_data?.data).find(Boolean)
  if (!data) throw new Error(`${label}: no image returned`)
  return Buffer.from(data, "base64")
}

// The map file's coast, river, wall and key places in red over a painting of the given box.
async function driftCheck(painting: string, box: Box, out: string) {
  const pts = (p: Point[] = []) => p.map((q) => q.join(",")).join(" ")
  const size = 1400
  let lines = ""
  for (const w of map.water) lines += `<polygon points="${pts(w.polygon)}" fill="none" stroke="red" stroke-width="${box[2] / 400}"/>`
  for (const r of map.rivers) lines += `<polyline points="${pts(r.path)}" fill="none" stroke="red" stroke-width="${box[2] / 400}"/>`
  for (const w of map.walls) lines += `<polyline points="${pts(w.path)}" fill="none" stroke="red" stroke-width="${box[2] / 400}"/>`
  for (const l of map.landmarks) if (!l.below) lines += `<circle cx="${l.x}" cy="${l.y}" r="${box[2] / 150}" fill="none" stroke="magenta" stroke-width="${box[2] / 400}"/>`
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${box.join(" ")}">${lines}</svg>`
  await sharp(painting)
    .resize(size, size)
    .composite([{ input: Buffer.from(overlay) }])
    .png()
    .toFile(out)
}

const OUTER_PROMPT = `Image 1 is an exact layout plan of a walled port city seen from directly above. Image 2 is the same plan with labels explaining each region; the labels are only for you and must never appear in the result.

Repaint image 1 as a finished, top-down illustrated fantasy city map, the quality of a premium published tabletop roleplaying adventure module: hand-inked linework with watercolour and gouache washes, every building drawn individually with pitched tile or slate roofs and soft cast shadows, cobbled streets, forests of individually inked tree crowns, patchwork farm fields with furrows, water with fine hand-drawn wave hatching, stone walls with round towers, sailing ships and boats at the piers. Warm aged parchment palette.

This is a trace, not a suggestion. Match image 1 shape for shape:
- Every blue area stays water: the open sea along the whole west edge and the harbour bay in the south-west, which opens to the sea. The coastline stays exactly where it is.
- The city wall keeps its exact outline, including the angled east side and the notch where the harbour meets the wall. Towers only where the sketch has them.
- Keep the ROUND market square inside the gate, the small rectangular plaza in the east with the mansion just north of it, and the walled garden north of the mansion.
- The castle in the north-east corner is a small round keep, not a large fortress. The rest of the east is noble estates with gardens.
- Keep every street and block where it is. Pale patches outside the walls are farm fields, not buildings.

Directly overhead, orthographic, no perspective. No text, letters, labels, compass, scale bar, border, frame or legend. Fill the whole image.`

// What a close-up of each district should show, from the encounters set there.
const DISTRICT_DETAIL: Record<string, string> = {
  docks:
    "Long warehouses with large roofs along the waterfront, crates, barrels and coiled rope on the quay, cargo nets, carts, mooring posts, planked piers, rowing boats, ripples round the hulls. Each ship is a clear top-down sailing ship: a pointed bow, a square stern, deck planks, round masts with yards across them and sails furled along the yards. No flat triangles, no ships overlapping each other or the piers.",
  "lower-districts":
    "Crowded, leaning tenements and shacks with patched roofs, narrow crooked alleys, washing lines strung between houses, refuse heaps, tiny yards, canvas awnings over a hidden market lane.",
  "old-quarter":
    "Old stone townhouses with moss on the roofs, a great library with a domed reading hall beside a church with a bell tower and graveyard, a small chapel, cloisters, wells and old trees in small squares.",
  "gate-ward":
    "The gatehouse in the south wall, the round market square just inside with festival stalls, bunting and a stage, an inn with a stable yard, busy streets of shops, counting houses by the river.",
  "asterian-quarter":
    "Grand mansions with slate roofs, formal gardens with hedges and fountains, a walled garden with ivy, a paved plaza before the largest mansion, a council hall, wide clean streets, the small round castle keep on the high ground.",
}

function districtPrompt(district: MapDistrict) {
  return `This image is a crop of a finished, hand-inked watercolour fantasy city map: ${district.name.replace(/^The /, "the ")} district of a walled port city, seen from directly above. Redraw this exact area as a close-up map at four times the detail, in the same style, palette and line work, the quality of a premium published tabletop roleplaying adventure module.

Keep everything exactly where it is in the crop: the coastline and any water, the city wall and its towers, every street, every square and every building block. Do not move, add or remove streets, walls or water.

Add the detail a close-up shows: individual roof tiles and ridge lines, chimneys, worn cobbles, small yards and trees. ${DISTRICT_DETAIL[district.id] ?? ""} Ships, if any, are drawn whole and seen from directly above, with hulls and sails in proportion.

Directly overhead, orthographic, no perspective. No text, letters, labels, compass, border, frame or legend. Fill the whole image.`
}

// Every street and block drawn from the map file, with no text unless labelled. Seeded, so a sketch redraws the same.
function sketchSvg(labelled: boolean) {
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const pick = <T>(list: T[]) => list[Math.floor(rnd() * list.length)]
  const pts = (p: Point[] = []) => p.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ")
  const inside = ([x, y]: Point, poly: Point[] = []) => {
    let r = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r
    }
    return r
  }
  const near = (x: number, y: number, id: string, r: number) => L[id] && Math.hypot(x - L[id].x, y - L[id].y) < r
  const wall = map.walls[0].path
  const [bx0, by0, bw0] = outerBox
  // District character: block size, street width, lot size, jitter, roofs.
  const STYLE: Record<string, { block: number; street: number; lot: number; jitter: number; roofs: string[]; angle: number }> = {
    docks: { block: 34, street: 5, lot: 7, jitter: 0.35, roofs: ["#8a5a3c", "#7a4e36", "#6e5a48", "#94684a"], angle: 6 },
    "lower-districts": { block: 26, street: 3.5, lot: 5.5, jitter: 0.55, roofs: ["#7d5640", "#6f5444", "#8b6046", "#5f4c3e"], angle: -8 },
    "old-quarter": { block: 38, street: 5, lot: 8, jitter: 0.4, roofs: ["#a4583a", "#96503a", "#ad6644", "#8c5a40"], angle: 0 },
    "gate-ward": { block: 36, street: 6, lot: 8, jitter: 0.25, roofs: ["#a85c3a", "#9a5638", "#b26a46", "#8e5236"], angle: 0 },
    "asterian-quarter": { block: 60, street: 9, lot: 14, jitter: 0.12, roofs: ["#5d6470", "#6b6f78", "#55606e", "#a35a3c"], angle: 3 },
  }
  const open = (x: number, y: number) =>
    near(x, y, "harvest-square", 42) ||
    near(x, y, "grand-square", 40) ||
    near(x, y, "blackthorn-garden", 46) ||
    near(x, y, "blackthorn-mansion", 34) ||
    near(x, y, "black-market", 22) ||
    near(x, y, "church-of-valkara", 26) ||
    near(x, y, "old-grand-library", 24) ||
    near(x, y, "castle", 40) ||
    near(x, y, "valtor-chapel", 16)
  let svg = `<rect x="${bx0 - 100}" y="${by0 - 100}" width="${bw0 + 200}" height="${bw0 + 200}" fill="#d8cfa8"/>`
  // Fields between the walls and the forest.
  for (let i = 0; i < 260; i++) {
    const x = bx0 + rnd() * bw0
    const y = by0 + rnd() * bw0
    if (inside([x, y], wall) || map.water.some((w) => inside([x, y], w.polygon))) continue
    const w = 30 + rnd() * 50
    const h = 18 + rnd() * 30
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${pick(["#cdc28f", "#c4ba84", "#d3c995", "#bdb47c", "#c9bd88"])}" stroke="#b3a874" stroke-width=".8" transform="rotate(${rnd() * 40 - 20} ${x} ${y})"/>`
  }
  for (const f of map.forests) {
    svg += `<polygon points="${pts(f.polygon)}" fill="#4f6b3a"/>`
    for (let i = 0; i < 2600; i++) {
      const x = bx0 + rnd() * bw0
      const y = by0 + rnd() * bw0
      if (inside([x, y], f.polygon)) svg += `<circle cx="${x}" cy="${y}" r="${5 + rnd() * 6}" fill="${pick(["#5e7d45", "#557340", "#68884c", "#4b6638"])}"/>`
    }
  }
  for (const w of map.water) svg += `<polygon points="${pts(w.polygon)}" fill="#6f9cb0"/>`
  for (const r of map.rivers) svg += `<polyline points="${pts(r.path)}" fill="none" stroke="#6f9cb0" stroke-width="${r.width}" stroke-linecap="round" stroke-linejoin="round"/>`
  for (const r of map.roads) svg += `<polyline points="${pts(r.path)}" fill="none" stroke="#bfa575" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
  svg += `<polygon points="${pts(wall)}" fill="#b9a789"/>`
  for (const d of map.districts) {
    const s = STYLE[d.id] ?? STYLE["gate-ward"]
    const xs = d.polygon.map((p) => p[0])
    const ys = d.polygon.map((p) => p[1])
    svg += `<clipPath id="clip-${d.id}"><polygon points="${pts(d.polygon)}"/></clipPath><g clip-path="url(#clip-${d.id})">`
    for (let by = Math.min(...ys) - 40; by < Math.max(...ys) + 40; by += s.block) {
      for (let bx = Math.min(...xs) - 40; bx < Math.max(...xs) + 40; bx += s.block) {
        const x0 = bx + (rnd() - 0.5) * s.block * s.jitter + s.street / 2
        const y0 = by + (rnd() - 0.5) * s.block * s.jitter + s.street / 2
        const bw = s.block * (0.85 + rnd() * 0.3) - s.street
        const bh = s.block * (0.85 + rnd() * 0.3) - s.street
        const cx = x0 + bw / 2
        const cy = y0 + bh / 2
        if (!inside([cx, cy], d.polygon) || open(cx, cy)) continue
        let lots = ""
        for (let lx = x0; lx < x0 + bw - 2; lx += s.lot * (0.8 + rnd() * 0.5)) {
          const w = Math.min(s.lot * (0.8 + rnd() * 0.5), x0 + bw - lx)
          const d1 = Math.min(s.lot * (1 + rnd() * 0.6), bh / 2)
          const d2 = Math.min(s.lot * (1 + rnd() * 0.6), bh / 2)
          lots += `<rect x="${lx}" y="${y0}" width="${w - 0.8}" height="${d1}" fill="${pick(s.roofs)}"/>`
          lots += `<rect x="${lx}" y="${y0 + bh - d2}" width="${w - 0.8}" height="${d2}" fill="${pick(s.roofs)}"/>`
        }
        const yard = d.id === "asterian-quarter" ? "#7f9a5c" : "#a8977a"
        svg += `<g transform="rotate(${s.angle + (rnd() - 0.5) * 10 * s.jitter} ${cx} ${cy})"><rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="${yard}"/>${lots}</g>`
      }
    }
    svg += "</g>"
  }
  // Main streets inside the walls.
  const street = (p: Point[], w: number) => (svg += `<polyline points="${pts(p)}" fill="none" stroke="#c9b48c" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`)
  street(
    [
      [560, 792],
      [560, 715],
      [520, 560],
      [480, 400],
      [500, 220],
    ],
    9
  )
  street(
    [
      [560, 715],
      [700, 600],
      [770, 420],
      [770, 340],
    ],
    8
  )
  street(
    [
      [385, 705],
      [160, 650],
    ],
    8
  )
  street(
    [
      [300, 640],
      [250, 420],
      [260, 200],
    ],
    6
  )
  street(
    [
      [480, 400],
      [690, 460],
    ],
    6
  )
  street(
    [
      [150, 470],
      [400, 470],
      [640, 300],
      [900, 300],
    ],
    5
  )
  const at = (id: string) => L[id]
  svg += `<circle cx="${at("harvest-square").x}" cy="${at("harvest-square").y}" r="36" fill="#cdb98f"/>`
  svg += `<rect x="${at("grand-square").x - 40}" y="${at("grand-square").y - 26}" width="80" height="52" fill="#cdb98f"/>`
  svg += `<rect x="${at("blackthorn-garden").x - 55}" y="${at("blackthorn-garden").y - 30}" width="100" height="62" fill="#6f8f4c"/>`
  for (let i = 0; i < 30; i++) svg += `<circle cx="${at("blackthorn-garden").x - 50 + rnd() * 90}" cy="${at("blackthorn-garden").y - 26 + rnd() * 54}" r="${3 + rnd() * 3}" fill="#557340"/>`
  const hall = (id: string, w: number, h: number, c: string, a = 0) =>
    (svg += `<rect x="${at(id).x - w / 2}" y="${at(id).y - h / 2}" width="${w}" height="${h}" fill="${c}" stroke="#3f342a" stroke-width="1" transform="rotate(${a} ${at(id).x} ${at(id).y})"/>`)
  hall("blackthorn-mansion", 64, 34, "#4f5966")
  hall("old-grand-library", 40, 24, "#8c6a52", -6)
  hall("church-of-valkara", 22, 44, "#7d5a48", -6)
  hall("valtor-chapel", 12, 22, "#7d5a48")
  hall("council-chambers", 34, 22, "#5a6170")
  svg += `<circle cx="${at("castle").x}" cy="${at("castle").y}" r="30" fill="#8d8478" stroke="#3f342a" stroke-width="2"/><rect x="${at("castle").x - 14}" y="${at("castle").y - 14}" width="28" height="28" fill="#6f665c"/>`
  // The quay, piers and ships.
  svg += `<polyline points="140,697 400,717" stroke="#9c8a70" stroke-width="7" fill="none"/>`
  for (let x = 170; x < 390; x += 34) svg += `<rect x="${x}" y="${703 + (x - 140) * 0.077}" width="7" height="${30 + rnd() * 20}" fill="#7a5c3e"/>`
  for (let i = 0; i < 9; i++) {
    const x = 160 + rnd() * 220
    const y = 745 + rnd() * 60
    const a = -20 + rnd() * 40
    svg += `<ellipse cx="${x}" cy="${y}" rx="15" ry="4.5" fill="#5b4330" transform="rotate(${a} ${x} ${y})"/>`
  }
  svg += `<circle cx="${at("harbour-tower").x}" cy="${at("harbour-tower").y}" r="9" fill="#8d8478" stroke="#3f342a" stroke-width="1.5"/>`
  svg += `<polyline points="${pts(wall)}" fill="none" stroke="#7d7466" stroke-width="7" stroke-linejoin="round"/>`
  for (const [x, y] of wall.slice(0, -1)) svg += `<circle cx="${x}" cy="${y}" r="9" fill="#8d8478" stroke="#4a4038" stroke-width="1.5"/>`
  svg += `<rect x="${at("south-gate").x - 14}" y="${at("south-gate").y - 9}" width="28" height="18" fill="#8d8478" stroke="#4a4038" stroke-width="1.5"/>`
  if (labelled) {
    const t = (x: number, y: number, text: string, size = 22) =>
      (svg += `<text x="${x}" y="${y}" font-size="${size}" font-family="Arial" font-weight="bold" fill="#000" stroke="#fff" stroke-width="5" paint-order="stroke" text-anchor="middle">${text}</text>`)
    t(-40, 300, "OPEN SEA")
    t(-40, 330, "(all water)", 16)
    t(150, 900, "HARBOUR WATER")
    t(150, 925, "(keep as water)", 16)
    t(1150, 790, "RIVER", 18)
    t(1150, 640, "ROAD", 16)
    t(700, -100, "FOREST")
    t(1050, 1100, "FOREST")
    t(400, 1000, "FARM FIELDS", 18)
    t(270, 260, "POOR DISTRICT", 18)
    t(270, 280, "dense alleys", 14)
    t(270, 620, "DOCKS", 18)
    t(510, 200, "OLD QUARTER", 18)
    t(600, 680, "GATE WARD", 16)
    t(560, 722, "ROUND MARKET SQUARE", 13)
    t(560, 820, "CITY GATE", 14)
    t(770, 425, "PLAZA", 13)
    t(770, 345, "MANSION", 13)
    t(780, 270, "WALLED GARDEN", 13)
    t(850, 160, "SMALL CASTLE KEEP", 13)
    t(800, 520, "NOBLE ESTATES", 16)
    t(480, 395, "LIBRARY", 12)
    t(530, 370, "CHURCH", 12)
    t(260, 750, "PIERS + SHIPS", 14)
    t(915, 470, "angled wall", 12)
  }
  const px = 2048
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${outerBox.join(" ")}">${svg}</svg>`
}

const UNDERGROUND_PROMPT = `Image 1 is an exact plan of tunnels and chambers deep beneath a city, seen from directly above. Image 2 is the same plan with labels explaining each part; the labels are only for you and must never appear in the result.

Repaint image 1 as a finished, top-down illustrated dungeon map, the quality of a premium published tabletop roleplaying adventure module: hand-inked linework with watercolour washes. Solid rock all round in dark grey-brown with fine hand-drawn crosshatching. Tunnels of laid stone with worn flagstones. Every chamber drawn with its own detail: a pillared chamber with gunpowder kegs and a fuse; a forking labyrinth of rough-hewn passages with glowing blue crystals in the walls; a dead end with a black iron door set into a blank stone wall, glowing pale blue runes round it and frost on the floor; a vast empty cavern floored in grey dust with a narrow arch at its far end; an ancient ruined temple of broken columns, an altar and an alcove behind it. A stair and a drain grate where the tunnel starts at the top right. Cool, dim palette with warm torchlight in the pillared chamber.

This is a trace, not a suggestion: every tunnel, chamber and dead end stays where it is in image 1, with the same shape and size.

Directly overhead, orthographic, no perspective, no grid. No text, letters, labels, compass, scale bar, border, frame or legend. Fill the whole image.`

// Tunnels and chambers in the underground box, laid along the map file's tunnel. Seeded, so it redraws the same.
function undergroundSvg(labelled: boolean) {
  const box = map.underground!.box
  let seed = 11
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const at = (id: string) => L[id]
  const path = map.tunnels[0].path.map((id) => [at(id).x, at(id).y] as Point)
  const pts = (p: Point[]) => p.map((q) => q.join(",")).join(" ")
  let svg = `<rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#2b2723"/>`
  for (let i = 0; i < 500; i++) svg += `<circle cx="${box[0] + rnd() * box[2]}" cy="${box[1] + rnd() * box[3]}" r="${2 + rnd() * 7}" fill="#36302b"/>`
  svg += `<polyline points="${pts(path)}" fill="none" stroke="#4a423a" stroke-width="20" stroke-linejoin="round" stroke-linecap="round"/>`
  svg += `<polyline points="${pts(path)}" fill="none" stroke="#7a6e60" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>`
  // The grate and the stair down.
  const g = at("drain-grate")
  svg += `<rect x="${g.x - 9}" y="${g.y - 9}" width="18" height="18" fill="#3d3631" stroke="#9a9a9a" stroke-width="1.5"/>`
  for (let i = -6; i <= 6; i += 4) svg += `<line x1="${g.x + i}" y1="${g.y - 8}" x2="${g.x + i}" y2="${g.y + 8}" stroke="#9a9a9a" stroke-width="1"/>`
  // The pillared chamber, its kegs and the fuse.
  const p = at("powder-chamber")
  svg += `<rect x="${p.x - 38}" y="${p.y - 28}" width="76" height="56" fill="#857868" stroke="#4a423a" stroke-width="3"/>`
  for (const [dx, dy] of [
    [-24, -16],
    [0, -16],
    [24, -16],
    [-24, 16],
    [0, 16],
    [24, 16],
  ])
    svg += `<circle cx="${p.x + dx}" cy="${p.y + dy}" r="4.5" fill="#5e544a"/>`
  for (let i = 0; i < 6; i++) svg += `<circle cx="${p.x - 14 + (i % 3) * 9}" cy="${p.y - 3 + Math.floor(i / 3) * 8}" r="3.5" fill="#6b4a2e"/>`
  svg += `<polyline points="${p.x + 10},${p.y} ${p.x + 30},${p.y + 6} ${p.x + 34},${p.y + 24}" fill="none" stroke="#2a1a10" stroke-width="1.2" stroke-dasharray="2 2"/>`
  // The labyrinth: a cave where the way forks, east and west spurs that dead-end, crystals in the walls.
  const l = at("labyrinth")
  svg += `<ellipse cx="${l.x}" cy="${l.y}" rx="34" ry="28" fill="#7a6e60" stroke="#4a423a" stroke-width="3"/>`
  const spurs: Point[][] = [
    [
      [l.x + 30, l.y - 6],
      [l.x + 62, l.y - 20],
      [l.x + 70, l.y + 8],
    ],
    [
      [l.x - 30, l.y - 10],
      [l.x - 58, l.y - 34],
      [l.x - 82, l.y - 30],
    ],
    [
      [l.x - 10, l.y - 26],
      [l.x - 6, l.y - 70],
      [l.x + 18, l.y - 84],
    ],
    [
      [l.x + 20, l.y + 24],
      [l.x + 34, l.y + 58],
    ],
  ]
  for (const spur of spurs) svg += `<polyline points="${pts(spur)}" fill="none" stroke="#7a6e60" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2
    svg += `<circle cx="${l.x + Math.cos(a) * 31}" cy="${l.y + Math.sin(a) * 25}" r="2.2" fill="#7fd3e0"/>`
  }
  // The sealed door: a blank wall across the passage with a black iron door and its runes.
  const d = at("sealed-door")
  svg += `<rect x="${d.x - 16}" y="${d.y - 16}" width="32" height="32" fill="#7a6e60"/><rect x="${d.x - 9}" y="${d.y - 3}" width="18" height="6" fill="#141414" stroke="#9fd8ff" stroke-width="1.5"/>`
  svg += `<circle cx="${d.x}" cy="${d.y}" r="13" fill="none" stroke="#9fd8ff" stroke-width="1" stroke-dasharray="2 2"/>`
  // The Big Empty: a vast dust-floored cavern, a narrow arch at the far end.
  const e = at("big-empty")
  svg += `<ellipse cx="${e.x}" cy="${e.y}" rx="42" ry="52" transform="rotate(35 ${e.x} ${e.y})" fill="#9a948a" stroke="#4a423a" stroke-width="3"/>`
  // The forgotten temple: a ruined hall of broken columns, an altar and the alcove behind it.
  const t = at("forgotten-temple")
  svg += `<rect x="${t.x - 40}" y="${t.y - 34}" width="80" height="68" fill="#8e8576" stroke="#4a423a" stroke-width="3" transform="rotate(35 ${t.x} ${t.y})"/>`
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) svg += `<circle cx="${t.x - 24 + i * 14}" cy="${t.y + side * 20}" r="4" fill="#6e665a" transform="rotate(35 ${t.x} ${t.y})"/>`
  svg += `<rect x="${t.x - 30}" y="${t.y - 7}" width="12" height="14" fill="#c9c1b0" transform="rotate(35 ${t.x} ${t.y})"/><rect x="${t.x - 46}" y="${t.y - 8}" width="8" height="16" fill="#5e564c" transform="rotate(35 ${t.x} ${t.y})"/>`
  if (labelled) {
    const text = (x: number, y: number, words: string, size = 11) =>
      (svg += `<text x="${x}" y="${y}" font-size="${size}" font-family="Arial" font-weight="bold" fill="#000" stroke="#fff" stroke-width="3.5" paint-order="stroke" text-anchor="middle">${words}</text>`)
    text(g.x - 10, g.y - 16, "DRAIN GRATE + STAIR DOWN")
    text(p.x, p.y - 36, "PILLARED CHAMBER: POWDER KEGS, FUSE")
    text(l.x + 10, l.y - 92, "LABYRINTH: FORKS, DEAD ENDS, CRYSTALS")
    text(d.x + 70, d.y + 4, "SEALED IRON DOOR, RUNES")
    text(e.x + 90, e.y + 10, "VAST EMPTY CAVERN, DUST")
    text(t.x + 70, t.y + 64, "RUINED TEMPLE: COLUMNS, ALTAR, ALCOVE")
    text(box[0] + 60, box[1] + 30, "SOLID ROCK", 14)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="${box.join(" ")}">${svg}</svg>`
}

void main()
