import "@fontsource/cinzel-decorative/400.css"
import "@fontsource/cinzel-decorative/700.css"
import "@fontsource/rethink-sans/400.css"
import "@fontsource/rethink-sans/500.css"
import "@fontsource/rethink-sans/600.css"
import "@fontsource/rethink-sans/700.css"
import "@fontsource/syne-mono/400.css"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { createRoot } from "react-dom/client"
import { DesktopGame } from "./play"
import "./style.css"
const start = () => createRoot(document.getElementById("root")!).render(<DesktopGame />)
// In a browser tab during development there is no Tauri, so the bridge goes to the dev server instead.
if (import.meta.env.DEV && !isTauri()) void import("./preview").then((m) => m.installPreview()).then(start)
else start()

// Release checks (D20_RENDER_REPORT): whether the stage came up, any errors, and its frame rate and draw counts
// sampled each second for the first 50 s. The app writes the report only when that variable is set.
if (isTauri()) {
  const errors: string[] = []
  addEventListener("error", (e) => errors.push(e.message))
  addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)))
  const stage = () => (window as unknown as { __stage?: { stats: () => Record<string, unknown> } }).__stage
  const samples: Record<string, unknown>[] = []
  const sampler = setInterval(() => {
    const s = stage()?.stats()
    if (s) samples.push({ t: Math.round(performance.now() / 1000), visible: document.visibilityState, fps: s.fps, calls: s.calls, triangles: s.triangles, tier: s.tier, dpr: s.dpr, shot: s.shot })
  }, 1000)
  const report = (final: boolean) =>
    void invoke("render_report", {
      report: {
        ready: Boolean(stage()),
        final,
        errors,
        visibility: document.visibilityState,
        resources: performance.getEntriesByType("resource").map((e) => ({ name: e.name, duration: e.duration })),
        samples,
      },
    })
  setTimeout(() => report(false), 20000)
  setTimeout(() => {
    clearInterval(sampler)
    report(true)
  }, 50000)
}
