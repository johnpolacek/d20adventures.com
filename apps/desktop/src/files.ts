// An adventure's art and figures, downloaded as it is played (runtime/files.ts), and served to the stage by the app's
// own file server (src-tauri/src/files.rs). A scene waits for its own files. The rest of the adventure's follow in the background, so
// later scenes are ready when play reaches them.
import { invoke, isTauri } from "@tauri-apps/api/core"
import { serveFrom } from "@d20/stage/served"
import { useEffect, useState } from "react"

type File = { path: string; bytes: number }
type Plan = { need: File[]; rest: File[] }

// About this much in each request to the runtime, which starts a process for each.
const BATCH = 4e6
// The bar shows only when the files will take longer than this.
const SHOW_BAR = 3000

const command = <T>(command: Record<string, unknown>) => invoke<T>("files_command", { command })

let host: Promise<string | null> | null = null
/** The app's own file server on 127.0.0.1 (src-tauri/src/files.rs), or null outside the app. */
export const appFilesHost = () => (host ??= isTauri() ? invoke<string>("files_host").catch(() => null) : Promise.resolve(null))

/** Points the stage's files at the app's own file server. The window calls it once, before it shows anything. */
export async function serveAppFiles() {
  const address = await appFilesHost()
  if (address) serveFrom(address)
}

function batches(files: File[]) {
  const out: File[][] = []
  let current: File[] = []
  let size = 0
  for (const f of files) {
    current.push(f)
    size += f.bytes
    if (size >= BATCH) {
      out.push(current)
      current = []
      size = 0
    }
  }
  if (current.length) out.push(current)
  return out
}

// One download at a time: a scene's own files go ahead of the background's.
let chain: Promise<unknown> = Promise.resolve()
const queued = <T>(work: () => Promise<T>) => {
  const next = chain.then(work, work)
  chain = next.catch(() => undefined)
  return next
}
const fetchBatch = (adventureId: string, files: File[]) =>
  command<{ done: string[]; failed: string[] }>({ kind: "filesFetch", adventureId, paths: files.map((f) => f.path) }).catch(() => ({ done: [], failed: files.map((f) => f.path) }))

// The rest of each adventure's files, fetched a batch at a time behind play. A scene that needs files jumps the queue
// between batches.
const background = new Map<string, boolean>()
let waiting = 0
async function fillIn(adventureId: string) {
  if (background.get(adventureId)) return
  background.set(adventureId, true)
  try {
    for (;;) {
      if (waiting) {
        await new Promise((r) => setTimeout(r, 250))
        continue
      }
      const plan = await command<Plan>({ kind: "filesPlan", adventureId })
      const next = batches(plan.rest)[0]
      if (!next) return
      const { done } = await queued(() => fetchBatch(adventureId, next))
      // Nothing came: offline, or the host is down. Try again later, not in a loop.
      if (!done.length) return
    }
  } finally {
    background.set(adventureId, false)
  }
}

export type SceneFiles = { ready: boolean; progress: number | null }

/** Whether the scene's files are in. `progress` is 0 to 1 once the wait looks longer than a few seconds, else null.
 * `playing`: an adventure is under way, so the rest of its files follow in the background. The title screen's scene
 * fetches its own alone. */
export function useSceneFiles(adventureId: string | undefined, encounterId: string | undefined, playing: boolean): SceneFiles {
  const [state, setState] = useState<SceneFiles>({ ready: !isTauri() || !adventureId, progress: null })
  useEffect(() => {
    if (!isTauri() || !adventureId) return setState({ ready: true, progress: null })
    let live = true
    const started = Date.now()
    setState({ ready: false, progress: null })
    ;(async () => {
      const plan = await command<Plan>({ kind: "filesPlan", adventureId, encounterId }).catch(() => ({ need: [], rest: [] }) as Plan)
      const total = plan.need.reduce((n, f) => n + f.bytes, 0)
      let done = 0
      // A first batch slow enough to pass the mark shows the bar without waiting for it to finish.
      const mark = setTimeout(() => live && setState((s) => (s.ready ? s : { ready: false, progress: total ? done / total : 0 })), SHOW_BAR)
      waiting++
      try {
        for (const batch of batches(plan.need)) {
          await queued(() => fetchBatch(adventureId, batch))
          done += batch.reduce((n, f) => n + f.bytes, 0)
          const elapsed = Date.now() - started
          // The time left at the pace so far, and a bar only when all of it looks longer than a few seconds.
          const expected = (elapsed / done) * total
          if (live) setState({ ready: false, progress: expected > SHOW_BAR || elapsed > SHOW_BAR ? done / total : null })
        }
      } finally {
        waiting--
        clearTimeout(mark)
      }
      if (live) setState({ ready: true, progress: null })
      if (playing) void fillIn(adventureId)
    })()
    return () => {
      live = false
    }
  }, [adventureId, encounterId, playing])
  return state
}
