// The same pictures of a figure every time, from the library's lit room: for a before and an after, and for a critic.
//
//   pnpm exec next dev -p 3057
//   Chrome with --remote-debugging-port=9478 (see scripts/stage-verify.ts)
//   node --import tsx asset-library/pipeline/views.ts <id> --out=<folder> [--lod=0] [--moves=Shoot@1.4,Swing@0.4]
//     [--only=half,face] [--do=<expression>]
//
// Writes <view>.jpg for each view below, at device scale 2, and sheet.jpg with all of them side by side. Every camera is
// set from the figure's height and the place of its head, so two models of one character are seen from the same points.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import sharp, { type OverlayOptions } from "sharp"

const BASE = process.env.STAGE_BASE || "http://localhost:3057"
const PORT = process.env.STAGE_CDP_PORT || "9478"
const ROOT = "asset-library/characters"
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A view: where the camera looks and stands, in the figure's heights (`H`) or from its head in metres (`head`).
type View = { name: string; clip?: string; at?: number; head?: [number, number, number]; target?: [number, number, number]; from?: [number, number, number] }
const FULL = 2.25
const round = (deg: number, up = 0.55): [number, number, number] => [Math.sin((deg * Math.PI) / 180) * FULL, up, Math.cos((deg * Math.PI) / 180) * FULL]
const VIEWS: View[] = [
  { name: "front", target: [0, 0.5, 0], from: round(0) },
  { name: "three-quarter", target: [0, 0.5, 0], from: round(35, 0.62) },
  { name: "side", target: [0, 0.5, 0], from: round(90) },
  { name: "back", target: [0, 0.5, 0], from: round(180) },
  { name: "half", target: [0, 0.76, 0], from: [0.28, 0.8, 1.05] },
  { name: "face", head: [0, 0.02, 0.72] },
  { name: "face-three-quarter", head: [0.46, 0.04, 0.56] },
]

async function main() {
  const id = process.argv[2]
  const out = arg("out")
  if (!id || id.startsWith("--") || !out) throw new Error("views.ts <id> --out=<folder> [--lod=0] [--moves=Shoot@1.4,Swing@0.4]")
  const lod = arg("lod") ?? "0"
  const figure = JSON.parse(await readFile(`${ROOT}/${id}/figure.json`, "utf8")) as { height: number; clips?: string[] }
  const H = figure.height
  const moves: View[] = (arg("moves") ?? "")
    .split(",")
    .filter(Boolean)
    .map((m) => ({ name: m.split("@")[0].toLowerCase().replace(/\s+/g, "-"), clip: m.split("@")[0], at: Number(m.split("@")[1] ?? 0), target: [0, 0.5, 0], from: round(35, 0.62) }))
  await mkdir(out, { recursive: true })

  const tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json()) as { id: string; webSocketDebuggerUrl: string }
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let n = 0
  const pending = new Map<number, (m: { result?: unknown; error?: unknown }) => void>()
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as { id?: number; result?: unknown; error?: unknown }
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)?.(m)
      pending.delete(m.id)
    }
  }
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<{ result?: { value?: unknown } }>((resolve, reject) => {
      const i = ++n
      const t = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 60000)
      pending.set(i, (r) => {
        clearTimeout(t)
        if (r.error) reject(new Error(JSON.stringify(r.error)))
        else resolve(r.result as never)
      })
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const ev = async <T>(expression: string) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value as T
  await send("Runtime.enable")
  await send("Page.enable")
  await send("Page.bringToFront")
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1500, deviceScaleFactor: 2, mobile: false })
  await send("Emulation.setFocusEmulationEnabled", { enabled: true })

  const made: string[] = []
  let clipUp: string | null = null
  // --only=<views>: those alone. --do=<expression>: run in the page before each picture, to try a light or a material.
  const only = arg("only")?.split(",")
  for (const view of [...VIEWS, ...moves].filter((v) => !only || only.includes(v.name))) {
    const clip = view.clip ?? "Idle"
    if (clip !== clipUp) {
      await send("Page.navigate", { url: `${BASE}/dev/assets?id=${id}&lod=${lod}&clip=${encodeURIComponent(clip)}` })
      let ready = false
      for (let i = 0; i < 360 && !ready; i++) {
        await delay(250)
        ready = (await ev<string | null>("window.__assets && window.__assets.ready").catch(() => null))?.startsWith(`${id}/`) ?? false
      }
      if (!ready) throw new Error(`${id} never loaded`)
      await delay(600)
      clipUp = clip
    }
    // The clip held at its moment, then the camera: the head is found once the pose is the one to be seen.
    const size = await ev<string>(
      `(() => { const r = window.__assets.room, T = r.controls.target, P = r.camera.position
        if (r.action) { r.action.paused = true; r.action.time = ${view.at ?? 0.6}; r.mixer.update(0) }
        r.figure.updateMatrixWorld(true)
        let head = null
        r.figure.traverse((o) => { if (!head && o.isBone && /(^|:)head$/i.test(o.name)) head = o })
        const h = head ? head.getWorldPosition(P.clone()) : { x: 0, y: ${H * 0.93}, z: 0 }
        if (${JSON.stringify(view.head ?? null)}) { const d = ${JSON.stringify(view.head ?? [0, 0, 0])}; T.set(h.x, h.y + 0.06, h.z); P.set(h.x + d[0], h.y + 0.06 + d[1], h.z + d[2]) }
        else { const t = ${JSON.stringify(view.target ?? [0, 0, 0])}, f = ${JSON.stringify(view.from ?? [0, 0, 1])}; T.set(t[0] * ${H}, t[1] * ${H}, t[2] * ${H}); P.set(f[0] * ${H}, f[1] * ${H}, f[2] * ${H}) }
        r.controls.update(); r.controls.update()
        return r.renderer.domElement.width + "x" + r.renderer.domElement.height })()`
    )
    if (arg("do")) await ev(arg("do") as string)
    await delay(500)
    const length = await ev<number>(
      "(async () => { const b = await window.__assets.capture(); const u = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) }); window.__pull = u.split(',')[1]; return window.__pull.length })()"
    )
    let b64 = ""
    for (let i = 0; i < length; i += 2_000_000) b64 += await ev<string>(`window.__pull.slice(${i}, ${i + 2_000_000})`)
    await sharp(Buffer.from(b64, "base64")).jpeg({ quality: 93 }).toFile(`${out}/${view.name}.jpg`)
    made.push(view.name)
    console.log(`${view.name}  ${size}`)
  }
  ws.close()
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => null)

  // The sheet: every view at one height, in rows of four.
  const tall = 900
  const cells = await Promise.all(made.map(async (name) => ({ name, image: await sharp(`${out}/${name}.jpg`).resize({ height: tall }).toBuffer({ resolveWithObject: true }) })))
  const perRow = 4
  const rows: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += perRow) rows.push(cells.slice(i, i + perRow))
  const wide = Math.max(...rows.map((row) => row.reduce((w, c) => w + c.image.info.width, 0)))
  const composite: OverlayOptions[] = []
  rows.forEach((row, y) => {
    let x = 0
    for (const c of row) {
      composite.push({ input: c.image.data, left: x, top: y * tall })
      x += c.image.info.width
    }
  })
  await sharp({ create: { width: wide, height: rows.length * tall, channels: 3, background: "#15120f" } })
    .composite(composite)
    .jpeg({ quality: 90 })
    .toFile(`${out}/sheet.jpg`)
  await writeFile(`${out}/views.json`, `${JSON.stringify({ id, lod: Number(lod), height: H, views: made, made: new Date().toISOString() }, null, 2)}\n`)
  console.log(`${out}/sheet.jpg`)
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
