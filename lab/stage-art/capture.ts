// Captures lab views over CDP from a real-GPU Chrome, like scripts/stage-verify.ts: one PNG per shot from the Stage's own
// canvas, at 1350x900 CSS and device scale 2 (3:2, the paint-over models' shape).
//
//   pnpm exec next dev -p 3057
//   Chrome with --remote-debugging-port=9478 --force-device-scale-factor=2 (see scripts/stage-verify.ts)
//   node --import tsx lab/stage-art/capture.ts --name=plain [--q=backdrop=stones-backdrop.webp] [--shots=stones,river] [--camera]
//
// Writes lab/stage-art/raw/captures/<name>-<shot>.png, and with --camera the shot's camera as <name>-<shot>.json.

import { mkdir, writeFile } from "node:fs/promises"

const BASE = process.env.STAGE_BASE || "http://localhost:3057"
const PORT = process.env.STAGE_CDP_PORT || "9478"
const OUT = "lab/stage-art/raw/captures"
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Msg = { id?: number; method?: string; params?: { exceptionDetails?: { text: string; exception?: { description?: string } } }; result?: unknown; error?: unknown }

async function main() {
  const name = arg("name") ?? "view"
  const q = arg("q") ?? ""
  const only = arg("shots")?.split(",")
  const tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json()) as { id: string; webSocketDebuggerUrl: string }
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let id = 0
  const pending = new Map<number, (m: Msg) => void>()
  const exceptions: string[] = []
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as Msg
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)?.(m)
      pending.delete(m.id)
    }
    if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text ?? "")
  }
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<{ result?: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } }>((resolve, reject) => {
      const i = ++id
      const t = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 120000)
      pending.set(i, (r) => {
        clearTimeout(t)
        if (r.error) reject(new Error(JSON.stringify(r.error)))
        else resolve(r.result as never)
      })
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const ev = async <T>(expression: string): Promise<T> => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result?.value as T
  }
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1350, height: 900, deviceScaleFactor: 2, mobile: false })
  await send("Emulation.setFocusEmulationEnabled", { enabled: true })
  await mkdir(OUT, { recursive: true })
  const url = `${BASE}/dev/stage-lab?motion=0&tier=${arg("tier") ?? "high"}${q ? `&${q}` : ""}`
  await send("Page.navigate", { url })
  let ready = false
  for (let i = 0; i < 480 && !ready; i++) {
    await delay(250)
    const state = await ev<{ ready: boolean; error?: string } | null>(
      "window.__stageError ? { ready: false, error: window.__stageError } : window.__stage && window.__lab ? { ready: window.__stage.ready } : null"
    ).catch(() => null)
    if (state?.error) throw new Error(state.error)
    ready = !!state?.ready
  }
  if (!ready) throw new Error(`never ready: ${url}`)
  await delay(2000)
  const shots = (await ev<string[]>("Object.keys(window.__stage.shots)")).filter((s) => !only || only.includes(s))
  for (const shot of shots) {
    await ev(`window.__stage.shot(${JSON.stringify(shot)}, { instant: true })`)
    await delay(1500)
    await writeFile(`${OUT}/${name}-${shot}.png`, await pull("window.__stage.capture()"))
    if (process.argv.includes("--camera")) await writeFile(`${OUT}/${name}-${shot}.json`, JSON.stringify(await ev("window.__lab.camera()")))
    // --record=<seconds>: the canvas as it plays, in real time, as WebM.
    const seconds = Number(arg("record") ?? 0)
    if (seconds > 0) {
      await ev(`(() => { const rec = new MediaRecorder(window.__stage.canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 16e6 }); const parts = [];
        rec.ondataavailable = e => parts.push(e.data); window.__rec = new Promise(r => { rec.onstop = () => r(new Blob(parts, { type: 'video/webm' })) }); rec.start(); setTimeout(() => rec.stop(), ${seconds * 1000}) })()`)
      await delay(seconds * 1000 + 1500)
      await writeFile(`${OUT}/${name}-${shot}.webm`, await pull("window.__rec"))
    }
    console.log(`${name}-${shot}`)
  }
  if (exceptions.length) console.log(`page exceptions: ${exceptions.slice(0, 3).join(" | ")}`)
  ws.close()
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => null)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
