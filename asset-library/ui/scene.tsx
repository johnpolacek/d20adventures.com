"use client"

// A live scene in the asset library (scene.ts): the place fills its frame, and its shots sit along the bottom.
// Drag to turn the camera, scroll or pinch to move in and out, and drag with two fingers or the right button to slide.

import { useEffect, useRef, useState } from "react"
import type { Scene as Opened, SceneOptions } from "../scene"

const pill = "rounded border border-[#e6c89640] bg-[#0e0a06b0] px-2 py-0.5 text-[11px] text-[#e9dcc3] backdrop-blur-sm hover:border-[#f2c97a] hover:text-[#f2c97a]"

export function Scene(props: Omit<SceneOptions, "onProgress">) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<Opened | null>(null)
  const [status, setStatus] = useState<string | null>("Loading")
  const [shots, setShots] = useState<[string, string][]>([])
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
        <div className="absolute right-3 bottom-3 left-3 flex flex-wrap items-center justify-center gap-1">
          {shots.map(([key, label]) => (
            <button key={key} type="button" className={pill} onClick={() => scene.current?.go(key)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
