"use client"

// A live scene in the asset library (scene.ts): the place fills its frame. Drag to turn the camera, scroll or pinch to
// move in and out, drag with two fingers or the right button to slide, and fly with W A S D. Where the camera can jump
// to is handed to whoever shows the scene, to lay out as it likes. The frame stays dark until the scene is whole: the set
// built, the cast standing as their figures and the camera where the scene opens. Then it fades in.

import { useEffect, useRef, useState } from "react"
import type { Scene as Opened, SceneOptions, Spot } from "../scene"

export interface Nav {
  shots: Spot[]
  open: string
  go: (shot: string) => void
}

export function Scene(props: Omit<SceneOptions, "onProgress" | "onPick"> & { onNav: (nav: Nav | null) => void; onPick: (shot: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<Opened | null>(null)
  const [status, setStatus] = useState<string | null>("Loading")
  const { set, staging, iso, files, figures, onNav, onPick } = props

  useEffect(() => {
    const el = host.current
    if (!el) return
    let gone = false
    setStatus("Loading")
    onNav(null)
    import("../scene")
      .then(({ openScene }) => openScene(el, { set, staging, iso, files, figures, onProgress: setStatus, onPick }))
      .then(async (opened) => {
        if (gone) return opened.stop()
        scene.current = opened
        await opened.stage.firstFrame
        // The camera was sent to where the scene opens: let that be drawn before anything is seen.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        if (gone) return
        setStatus(null)
        onNav({ shots: opened.shots, open: opened.open, go: opened.go })
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
  }, [set, staging, iso, files, figures, onNav, onPick])

  return (
    <>
      <div ref={host} className={`absolute inset-0 transition-opacity duration-300 ${status ? "opacity-0" : "opacity-100"}`} />
      {status && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-[#e9dcc3] opacity-70">{status}</div>}
    </>
  )
}
