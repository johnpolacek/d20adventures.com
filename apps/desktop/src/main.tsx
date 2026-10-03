import "@fontsource/cinzel-decorative/700.css"
import "@fontsource/rethink-sans/400.css"
import "@fontsource/rethink-sans/500.css"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { createRoot } from "react-dom/client"
import { DesktopGame } from "./play"
import "./style.css"
createRoot(document.getElementById("root")!).render(<DesktopGame />)

if (isTauri()) {
  const errors: string[] = []
  addEventListener("error", (e) => errors.push(e.message))
  addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)))
  setTimeout(
    () =>
      void invoke("render_report", {
        report: {
          ready: Boolean((window as unknown as { __stage?: unknown }).__stage),
          errors,
          visibility: document.visibilityState,
          resources: performance.getEntriesByType("resource").map((e) => ({ name: e.name, duration: e.duration })),
        },
      }),
    20000
  )
}
