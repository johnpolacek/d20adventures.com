"use client"

// A live scene in the asset library (scene.ts): the place fills its frame, and its shots sit along the bottom.
// Drag to turn the camera, scroll or pinch to move in and out, and drag with two fingers or the right button to slide.

import { useEffect, useRef, useState } from "react"
import type { Scene as Opened, SceneOptions, Spot } from "../scene"

const pill = (on: boolean) =>
  `rounded border px-2.5 py-1 text-[12px] backdrop-blur-sm hover:border-[#f2c97a] hover:text-[#f2c97a] ${on ? "border-[#f2c97a] bg-[#f2c97a26] text-[#f2c97a]" : "border-[#e6c89640] bg-[#0e0a06b0] text-[#e9dcc3]"}`

export function Scene(props: Omit<SceneOptions, "onProgress">) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<Opened | null>(null)
  const [status, setStatus] = useState<string | null>("Loading")
  const [shots, setShots] = useState<Spot[]>([])
  const [at, setAt] = useState("")
  const { set, staging, iso, files, figures } = props

  useEffect(() => {
    const el = host.current
    if (!el) return
    let gone = false
    setStatus("Loading")
    setShots([])
    import("../scene")
      .then(({ openScene }) => openScene(el, { set, staging, iso, files, figures, onProgress: setStatus }))
      .then(async (opened) => {
        if (gone) return opened.stop()
        scene.current = opened
        setShots(opened.shots)
        setAt(opened.open)
        await opened.stage.firstFrame
        if (!gone) setStatus(null)
      })
      .catch((error) => {
        console.error(error)
        if (!gone) setStatus("This place could not be shown here.")
      })
    return () => {
      gone = true
      scene.current?.stop()
      scene.current = null
      el.replaceChildren()
    }
  }, [set, staging, iso, files, figures])

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      {status && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-[#e9dcc3] opacity-70">{status}</div>}
      {!status && shots.length > 1 && (
        <div className="absolute right-3 bottom-3 left-3 space-y-1.5">
          {[false, true].map((cast) => {
            const row = shots.filter((s) => !!s.cast === cast)
            return row.length ? (
              <div key={String(cast)} className="flex flex-wrap items-center justify-center gap-1">
                <span className="w-10 text-right text-[10px] tracking-[0.14em] text-[#e9dcc3] uppercase [text-shadow:0_1px_3px_#000]">{cast ? "Cast" : "View"}</span>
                {row.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={pill(s.key === at)}
                    onClick={() => {
                      scene.current?.go(s.key)
                      setAt(s.key)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null
          })}
        </div>
      )}
    </>
  )
}
