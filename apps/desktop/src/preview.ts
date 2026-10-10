import { mockIPC } from "@tauri-apps/api/mocks"

// The app in a browser tab, for checking screens without Tauri (development only). Bridge calls go to the dev
// server, which answers as Rust would. See the preview plugin in vite.config.mjs.
export function installPreview() {
  mockIPC(async (cmd, args) => {
    const res = await fetch("/__preview", { method: "POST", body: JSON.stringify({ cmd, args }) })
    if (!res.ok) throw await res.text()
    return res.json()
  })
}
