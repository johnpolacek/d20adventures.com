"use client"

// Client half of /dev/set-preview: builds the set with the scene-kit runtime and
// shows a small HUD with camera jumps, marks and render stats. Everything three
// is loaded inside the effect so nothing WebGL touches the server bundle.

import { useEffect, useRef, useState } from "react"
import type { SceneRuntime } from "@/lib/scene-kit/runtime"
import type { SetMark } from "@/lib/scene-kit/set"

interface Props {
  setId: string
  title: string
  timeOfDay: "day" | "dusk" | "night"
  sets: { id: string; title: string }[]
}

export function SetViewer({ setId, title, timeOfDay, sets }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<SceneRuntime | null>(null)
  const [status, setStatus] = useState("Loading…")
  const [ready, setReady] = useState(false)
  const [cameras, setCameras] = useState<string[]>([])
  const [marks, setMarks] = useState<Record<string, SetMark>>({})
  const [stats, setStats] = useState({ calls: 0, triangles: 0, fps: 0 })
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let runtime: SceneRuntime | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      const [{ createRuntime }, { getSetEntry }] = await Promise.all([import("@/lib/scene-kit/runtime"), import("@/lib/scene-sets/manifest")])
      const entry = getSetEntry(setId)
      if (!entry) {
        setStatus(`Unknown set: ${setId}`)
        return
      }
      const definition = await entry.load()
      if (cancelled) return
      runtime = await createRuntime({ container, set: definition, toggles: { timeOfDay }, onProgress: setStatus })
      if (cancelled) {
        runtime.dispose()
        return
      }
      runtimeRef.current = runtime
      setCameras(Object.keys(runtime.set.cameras))
      setMarks(runtime.set.marks)
      setReady(true)
      interval = setInterval(() => setStats(runtime?.stats() ?? { calls: 0, triangles: 0, fps: 0 }), 1000)
    })().catch((error) => {
      console.error(error)
      setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`)
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "h" || e.key === "H") setHidden((h) => !h)
      const index = Number(e.key) - 1
      const names = runtimeRef.current ? Object.keys(runtimeRef.current.set.cameras) : []
      if (index >= 0 && index < names.length) runtimeRef.current?.setCamera(names[index])
    }
    addEventListener("keydown", onKey)
    return () => {
      cancelled = true
      removeEventListener("keydown", onKey)
      if (interval) clearInterval(interval)
      runtime?.dispose()
      runtimeRef.current = null
    }
  }, [setId, timeOfDay])

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#0d0b09] font-serif text-[#e9dcc3]">
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0d0b09]">
          <div className="text-2xl tracking-[0.18em] text-[#f2c97a]">{title.toUpperCase()}</div>
          <div className="mt-3 text-sm opacity-70">{status}</div>
        </div>
      )}
      {ready && !hidden && (
        <div className="absolute bottom-4 left-4 max-w-xs rounded-md border border-[#e6c89640] bg-[#0e0a06a0] px-4 py-3 text-xs leading-relaxed backdrop-blur-sm">
          <div className="mb-1 text-[15px] tracking-[0.06em] text-[#f2c97a]">{title.toUpperCase()}</div>
          <div>
            <b>Drag</b> orbit · <b>Wheel</b> zoom · <b>Right-drag</b> pan
          </div>
          <div>
            <b>W A S D</b> move · <b>Q / E</b> down / up · <b>Shift</b> fast · <b>H</b> hide
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {cameras.map((name, i) => (
              <button
                key={name}
                type="button"
                onClick={() => runtimeRef.current?.setCamera(name)}
                className="rounded border border-[#f2c97a66] bg-[#f2c97a1f] px-2 py-0.5 text-[#f2c97a] hover:bg-[#f2c97a47]"
                title={runtimeRef.current?.set.cameras[name]?.label}
              >
                {i + 1} {name}
              </button>
            ))}
          </div>
          <div className="mt-2 opacity-80">
            Marks:{" "}
            {Object.entries(marks)
              .map(([name, mark]) => `${name} (${mark.position.map((v) => v.toFixed(1)).join(", ")})`)
              .join(" · ")}
          </div>
          <div className="mt-2 opacity-70">
            {stats.fps.toFixed(0)} fps · {stats.calls} calls · {(stats.triangles / 1000).toFixed(0)}k tris · {timeOfDay}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 opacity-80">
            {sets.map((item) => (
              <a key={item.id} href={`/dev/set-preview?set=${item.id}&time=${timeOfDay}`} className={item.id === setId ? "underline" : ""}>
                {item.title}
              </a>
            ))}
            <span>·</span>
            {(["day", "dusk", "night"] as const).map((t) => (
              <a key={t} href={`/dev/set-preview?set=${setId}&time=${t}`} className={t === timeOfDay ? "underline" : ""}>
                {t}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
