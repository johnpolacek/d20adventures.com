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
  // Where the camera stood when the scene was last taken down. A place built again in another look opens there, so
  // the two can be switched between at one view.
  const kept = useRef<{ place: string; position: number[]; target: number[]; fov: number } | null>(null)
  const { set, staging, iso, files, figures, painted, lookOn, onNav, onPick } = props

  useEffect(() => {
    const el = host.current
    if (!el) return
    let gone = false
    const place = `${set}|${staging}|${iso}|${painted ?? ""}`
    setStatus("Loading")
    onNav(null)
    import("../scene")
      .then(({ openScene }) => openScene(el, { set, staging, iso, files, figures, painted, lookOn, onProgress: setStatus, onPick }))
      .then(async (opened) => {
        if (gone) return opened.stop()
        scene.current = opened
        const was = kept.current
        const stay = !!was && was.place === place
        if (was && stay) {
          opened.stage.shot({ position: was.position, target: was.target, fov: was.fov } as Parameters<typeof opened.stage.shot>[0], { instant: true })
          opened.stage.controls?.target.set(was.target[0], was.target[1], was.target[2])
        }
        await opened.stage.firstFrame
        // The camera was sent to where the scene opens: let that be drawn before anything is seen.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        if (gone) return
        setStatus(null)
        onNav({ shots: opened.shots, open: stay ? "" : opened.open, go: opened.go })
        // For whoever is finding a view for a look: `__place.view()` in the console is the camera as a shot is written.
        ;(window as unknown as { __place?: unknown }).__place = { stage: opened.stage, view: opened.view, go: opened.go, shots: opened.shots, open: opened.open }
      })
      .catch((error) => {
        console.error(error)
        if (!gone) setStatus("This place could not be shown here.")
      })
    return () => {
      gone = true
      const st = scene.current?.stage
      if (st) {
        const at = st.controls?.target ?? st.camera.getWorldDirection(st.camera.position.clone()).multiplyScalar(10).add(st.camera.position)
        kept.current = { place, position: st.camera.position.toArray(), target: at.toArray(), fov: st.camera.fov }
      }
      scene.current?.stop()
      scene.current = null
      el.replaceChildren()
    }
  }, [set, staging, iso, files, figures, painted, lookOn, onNav, onPick])

  return (
    <>
      <div className="up-lib-dark absolute inset-0" />
      <div ref={host} className={`absolute inset-0 transition-opacity duration-300 ${status ? "opacity-0" : "opacity-100"}`} />
      {status && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[#e9dcc3] opacity-70">{status}</div>}
    </>
  )
}
