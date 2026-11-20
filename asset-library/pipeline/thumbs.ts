// A picture of each figure as it stands in the library's lit room, for its card: characters/<id>/thumb.webp.
//
//   pnpm exec next dev -p 3057
//   Chrome with --remote-debugging-port=9478 (see scripts/stage-verify.ts)
//   node --import tsx asset-library/pipeline/thumbs.ts [id ...]
//
// The picture is taken from the library's own page, so a card shows the figure the page will: the same model, the same
// light, standing as its Idle has it. Without one, a card shows the grey pose sheet the model was made from.

import { existsSync } from "node:fs"
import { readdir, readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"

const BASE = process.env.STAGE_BASE || "http://localhost:3057"
const PORT = process.env.STAGE_CDP_PORT || "9478"
const ROOT = "asset-library/characters"
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const asked = process.argv.slice(2)
  const ids = (await readdir(ROOT)).sort().filter((id) => existsSync(`${ROOT}/${id}/figure.json`) && (!asked.length || asked.includes(id)))
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
  // A window the shape of a card, so the frame needs no cropping.
  await send("Emulation.setDeviceMetricsOverride", { width: 600, height: 800, deviceScaleFactor: 2, mobile: false })
  await send("Emulation.setFocusEmulationEnabled", { enabled: true })
  for (const id of ids) {
    const file = `${ROOT}/${id}/figure.json`
    const figure = JSON.parse(await readFile(file, "utf8")) as { height: number; thumb?: string }
    await send("Page.navigate", { url: `${BASE}/dev/assets?id=${id}&v=${id}&clip=Idle` })
    let ready = false
    for (let i = 0; i < 240 && !ready; i++) {
      await delay(250)
      ready = (await ev<string | null>("window.__assets && window.__assets.ready").catch(() => null))?.startsWith(`${id}/`) ?? false
    }
    if (!ready) throw new Error(`${id} never loaded`)
    const H = figure.height
    // A little to its left and above its middle, looking at its middle, a moment into its Idle.
    await ev(
      `(() => { const r = window.__assets.room; r.controls.target.set(0, ${H * 0.5}, 0); r.camera.position.set(${H * 0.55}, ${H * 0.64}, ${H * 2.2}); r.controls.update(); if (r.action) { r.action.time = 0.6; r.mixer.update(0) } })()`
    )
    await delay(400)
    // The frame, moved in slices: one large CDP message stalls the socket.
    const size = await ev<number>(
      "(async () => { const b = await window.__assets.capture(); const u = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) }); window.__pull = u.split(',')[1]; return window.__pull.length })()"
    )
    let b64 = ""
    for (let i = 0; i < size; i += 2_000_000) b64 += await ev<string>(`window.__pull.slice(${i}, ${i + 2_000_000})`)
    await sharp(Buffer.from(b64, "base64")).resize({ width: 600, height: 800, fit: "cover" }).webp({ quality: 88 }).toFile(`${ROOT}/${id}/thumb.webp`)
    await writeFile(file, `${JSON.stringify({ ...figure, thumb: "thumb.webp" }, null, 2)}\n`)
    console.log(`${id}  thumb.webp`)
  }
  ws.close()
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => null)
}
main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
