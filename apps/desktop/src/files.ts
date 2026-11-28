// An adventure's art and figures, downloaded as it is played (runtime/files.ts), and served to the stage by the app's
// own file server (src-tauri/src/files.rs). A scene waits for its own files. The rest of the adventure's follow in the background, so
// later scenes are ready when play reaches them.
import { invoke, isTauri } from "@tauri-apps/api/core"
import { serveFrom } from "@d20/stage/served"
import { useEffect, useState } from "react"
import { DownloadScheduler, type DownloadTransport, type FetchResult, type FileEntry, type FilePlan } from "./files-scheduler"

const command = <T>(command: Record<string, unknown>) => invoke<T>("files_command", { command })

let host: Promise<string | null> | null = null
/** The app's own file server on 127.0.0.1 (src-tauri/src/files.rs), or null outside the app. */
export const appFilesHost = () => (host ??= isTauri() ? invoke<string>("files_host").catch(() => null) : Promise.resolve(null))

/** Points the stage's files at the app's own file server. The window calls it once, before it shows anything. */
export async function serveAppFiles() {
  const address = await appFilesHost()
  if (address) serveFrom(address)
}

const scheduler = new DownloadScheduler()

const transport: DownloadTransport = {
  plan: (adventureId: string, encounterId?: string) =>
    command<FilePlan>({ kind: "filesPlan", adventureId, ...(encounterId ? { encounterId } : {}) }),
  fetch: (adventureId: string, files: FileEntry[]) =>
    command<FetchResult>({ kind: "filesFetch", adventureId, paths: files.map((f) => f.path) }).catch(() => ({
      done: [],
      failed: files.map((f) => f.path),
    })),
}

export type SceneFiles = { ready: boolean; progress: number | null }

/** Whether the scene's files are in. `progress` is 0 to 1 once the wait looks longer than a few seconds, else null.
 * `playing`: an adventure is under way, so the rest of its files follow in the background. The title screen's scene
 * fetches its own alone. */
export function useSceneFiles(adventureId: string | undefined, encounterId: string | undefined, playing: boolean): SceneFiles {
  const [state, setState] = useState<SceneFiles>({ ready: !isTauri() || !adventureId, progress: null })
  useEffect(() => {
    if (!isTauri() || !adventureId) return setState({ ready: true, progress: null })
    const abort = new AbortController()
    setState({ ready: false, progress: null })
    void scheduler
      .loadScene({
        adventureId,
        encounterId,
        signal: abort.signal,
        transport,
        onProgress: (progress) => setState((s) => (s.ready ? s : { ready: false, progress })),
        onReady: () => setState({ ready: true, progress: null }),
      })
      .then((completed) => {
        if (completed && playing) void scheduler.fillIn(adventureId, transport)
      })
    return () => {
      abort.abort()
    }
  }, [adventureId, encounterId, playing])
  return state
}
