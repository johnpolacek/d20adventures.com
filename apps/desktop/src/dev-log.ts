// Development only: the window's errors and warnings, with their stacks, go to the dev server, which writes them to
// apps/desktop/.logs/window.log (vite.config.mjs), so they can be read from outside the window.
const send = (level: string, parts: unknown[]) => {
  const text = parts.map((p) => (p instanceof Error ? `${p.name}: ${p.message}\n${p.stack ?? ""}` : typeof p === "string" ? p : JSON.stringify(p))).join(" ")
  void fetch("/__d20-log", { method: "POST", body: `${new Date().toISOString()} ${level} ${text}\n` }).catch(() => undefined)
}

export function installDevLog() {
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console)
    console[level] = (...parts: unknown[]) => {
      send(level, parts)
      original(...parts)
    }
  }
  addEventListener("error", (e) => send("uncaught", [e.error ?? e.message]))
  addEventListener("unhandledrejection", (e) => send("unhandled", [e.reason]))
  send("start", [location.href])
}
