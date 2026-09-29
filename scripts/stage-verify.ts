// Browser verification for Stageview, over the Chrome DevTools Protocol against a real-GPU Chrome.
//
//   1. pnpm exec next dev -p 3057            (the /dev pages need no Convex)
//   2. "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir=/tmp/stage-chrome \
//        --remote-debugging-port=9478 --force-device-scale-factor=2
//   3. pnpm exec tsx scripts/stage-verify.ts [--tiers=ultra,high] [--staging=<key>] [--shots=gate,party] [--motion]
//
// Checks: the page builds the set, no exceptions, every shader program runnable, and per shot the draw calls and
// triangles against the Stageview budgets. Writes a full frame per shot and native-pixel crops of each visible cast member
// (the viewport is 1440x900 CSS at device scale 2, so a frame is 2880x1800 at the ultra tier and crops are 1:1 physical pixels).
// Env: STAGE_BASE (http://localhost:3057), STAGE_CDP_PORT (9478), STAGE_OUT (test-results/stage-verify).

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.STAGE_BASE || "http://localhost:3057"
const PORT = process.env.STAGE_CDP_PORT || "9478"
const OUT = process.env.STAGE_OUT || "test-results/stage-verify"
const BUDGET = { calls: 300, triangles: 2_500_000 }
const W = 1440
const H = 900
const DPR = 2

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const tiers = (arg("tiers") ?? "ultra").split(",")
const staging = arg("staging") ?? "march-of-davos/the-gates-of-kordavos"
const onlyShots = arg("shots")?.split(",")
const motion = process.argv.includes("--motion")
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Msg = { id?: number; method?: string; params?: any; result?: any; error?: unknown }

async function connect() {
  const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
  let tab = list.find((t) => t.type === "page")
  if (!tab) tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json()) as { type: string; webSocketDebuggerUrl: string }
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let id = 0
  const pending = new Map<number, (m: Msg) => void>()
  const exceptions: string[] = []
  const consoleErrors: string[] = []
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as Msg
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m)
      pending.delete(m.id)
    }
    if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      consoleErrors.push(m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(" "))
  }
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((resolve, reject) => {
      const i = ++id
      const t = setTimeout(() => {
        pending.delete(i)
        reject(new Error(`CDP timeout: ${method}`))
      }, 120000)
      pending.set(i, (r) => {
        clearTimeout(t)
        if (r.error) reject(new Error(JSON.stringify(r.error)))
        else resolve(r.result)
      })
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const ev = async <T = unknown>(expression: string): Promise<T> => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result?.value as T
  }
  return { ws, send, ev, exceptions, consoleErrors }
}

async function main() {
  const cdp = await connect()
  const { send, ev } = cdp
  // A PNG blob from the page, moved in 2 MB slices: one large CDP message stalls the socket.
  const pull = async (blobExpr: string) => {
    const n = await ev<number>(
      `(async () => { const b = await (${blobExpr}); const u = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) }); window.__pull = u.split(',')[1]; return window.__pull.length })()`
    )
    let b64 = ""
    for (let i = 0; i < n; i += 2_000_000) b64 += await ev<string>(`window.__pull.slice(${i}, ${i + 2_000_000})`)
    await ev("window.__pull = null")
    return Buffer.from(b64, "base64")
  }
  await send("Runtime.enable")
  await send("Page.enable")
  await send("Page.bringToFront")
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false })
  await send("Emulation.setFocusEmulationEnabled", { enabled: true })
  await mkdir(OUT, { recursive: true })
  let failures = 0
  const fail = (m: string) => {
    failures++
    console.log(`FAIL: ${m}`)
  }
  const pass = (m: string) => console.log(`PASS: ${m}`)

  for (const tier of tiers) {
    const url = `${BASE}/dev/stage?staging=${staging}&tier=${tier}${motion ? "" : "&motion=0"}`
    const t0 = Date.now()
    await send("Page.navigate", { url })
    let ok = false
    for (let i = 0; i < 400; i++) {
      await delay(250)
      const state = await ev<{ ready: boolean; error?: string } | null>(
        "window.__stageError ? { ready: false, error: window.__stageError } : window.__stage ? { ready: window.__stage.ready } : null"
      ).catch(() => null)
      if (state?.error) {
        fail(`${tier}: ${state.error}`)
        break
      }
      if (state?.ready) {
        ok = true
        break
      }
    }
    if (!ok) {
      fail(`${tier}: stage never became ready (${url})`)
      continue
    }
    const readyMs = Date.now() - t0
    // Let the atlas upload, shaders warm and the first LOD pass settle.
    await delay(1500)
    const errs = await ev<string[]>("window.__stage.programErrors()")
    if (errs.length) fail(`${tier}: shader programs failed: ${errs.join(", ")}`)
    else pass(`${tier}: ready in ${(readyMs / 1000).toFixed(1)} s (dev build); ${await ev<number>("window.__stage.stats().programs")} shader programs, all runnable`)
    const cast = await ev<{ id: string; height: number }[]>("window.__stage.cast.map(c => ({ id: c.id, height: c.height }))")
    const shots = (await ev<string[]>("Object.keys(window.__stage.shots)")).filter((s) => !onlyShots || onlyShots.includes(s))
    for (const shot of shots) {
      await ev(`window.__stage.shot(${JSON.stringify(shot)}, { instant: true })`)
      await delay(motion ? 1600 : 900)
      // Frame stats over a second of rendering.
      const s0 = await ev<{ frame: number }>("window.__stage.stats()")
      await delay(1100)
      const s = await ev<{ fps: number; calls: number; triangles: number; cards: number; people: number; dpr: number; paintHeight: number; frame: number; aa: string }>("window.__stage.stats()")
      const frames = s.frame - s0.frame
      const line = `${tier}/${shot}: ${s.calls} calls, ${(s.triangles / 1e6).toFixed(2)}M tris, ${s.cards}/${s.people} cards, ~${frames} fps (dpr ${s.dpr}, paint ${s.paintHeight}px, aa ${s.aa})`
      if (s.calls > BUDGET.calls || s.triangles > BUDGET.triangles) fail(`${line} — over budget (${BUDGET.calls} calls, ${BUDGET.triangles / 1e6}M tris)`)
      else pass(line)
      // Pixels come from the Stage's own canvas (a frame rendered on demand, read in the same task), not from the page
      // compositor: exact physical pixels, no HUD, and no dependence on the window being on screen.
      await writeFile(path.join(OUT, `${tier}-${shot}.png`), await pull("window.__stage.capture()"))
      // Native-pixel crops: the screen box around each visible cast member, cut 1:1 from the canvas pixels.
      for (const c of cast) {
        const crop = await ev<string | null>(`(async () => {
          const st = window.__stage, cam = st.camera, cv = st.canvas
          const c = st.cast.find(m => m.id === ${JSON.stringify(c.id)}); if (!c) return null
          const k = cv.width / cv.clientWidth
          const pts = [0, c.height * 1.04].map(y => cam.position.clone().set(c.x, y, c.z).project(cam))
          if (pts.some(v => v.z > 1)) return null
          const sx = v => (v.x * .5 + .5) * cv.width, sy = v => (-v.y * .5 + .5) * cv.height
          const top = sy(pts[1]), bottom = sy(pts[0]), h = (bottom - top) * 1.1, cx = sx(pts[0])
          if (h < 80 * k) return null
          const w = h * .6, x = Math.max(0, Math.round(cx - w / 2)), y = Math.max(0, Math.round(top - h * .05))
          const cw = Math.min(Math.round(w), cv.width - x), ch = Math.min(Math.round(h), cv.height - y)
          if (cw < 40 || ch < 40) return null
          const bmp = await createImageBitmap(await st.capture(), x, y, cw, ch)
          const o = document.createElement('canvas'); o.width = cw; o.height = ch; o.getContext('2d').drawImage(bmp, 0, 0)
          window.__crop = o
          return 'crop'
        })()`)
        if (crop) await writeFile(path.join(OUT, `${tier}-${shot}-${c.id}.png`), await pull("new Promise(r => window.__crop.toBlob(r, 'image/png'))"))
      }
    }
  }
  if (cdp.exceptions.length) fail(`page exceptions: ${cdp.exceptions.slice(0, 5).join(" | ")}`)
  const errors = cdp.consoleErrors.filter((e) => !/Download the React DevTools|favicon/i.test(e))
  if (errors.length) console.log(`NOTE: console errors: ${errors.slice(0, 5).join(" | ")}`)
  console.log(failures ? `${failures} failure(s); screenshots in ${OUT}` : `All checks passed; screenshots in ${OUT}`)
  cdp.ws.close()
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
