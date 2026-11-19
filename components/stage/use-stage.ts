"use client"

import type { Flags, Stage, TierName } from "@d20/stage"
import { type RefObject, useEffect, useRef, useState } from "react"

// Creates a Stage in `container` for a set (and optional staging) and disposes it on unmount. three.js loads inside the
// effect, so nothing WebGL touches the server bundle. A set the game plays as built (asset-library/play.ts) is built
// from its look, with figures for its cast, in place of its paintings and cards.
export function useStage(container: RefObject<HTMLDivElement | null>, opts: { set: unknown; staging?: unknown; tier?: TierName | "auto"; flags?: Partial<Flags> } | null) {
  const stageRef = useRef<Stage | null>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [status, setStatus] = useState("Loading")
  const [error, setError] = useState<string | null>(null)
  // The last picture of the stage being replaced, held over the container until the next one is built, dressed and
  // framed. Without it the scene change shows black, then the new set before its trees are planted and before the
  // play screen has put the camera where the scene opens.
  const cover = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const el = container.current
    const lift = (fade: boolean) => {
      const c = cover.current
      cover.current = null
      if (!c) return
      if (!fade) return void c.remove()
      c.style.transition = "opacity 350ms ease"
      c.style.opacity = "0"
      setTimeout(() => c.remove(), 400)
    }
    if (!el || !opts) return void lift(false)
    let cancelled = false
    let created: Stage | null = null
    let undress: (() => void) | null = null
    // A new set starts clean: no error or status left over from the one it replaces.
    setError(null)
    setStatus("Loading")
    ;(async () => {
      const [{ createStage }, { builtPlay, playedLook }] = await Promise.all([import("@d20/stage"), import("@/asset-library/play")])
      const look = playedLook((opts.staging as { set?: string } | undefined)?.set)
      const built = look ? builtPlay(opts.set, opts.staging, look) : null
      if (built?.cards.length) console.warn(`[stage] no figure for ${built.cards.join(", ")}: shown as a card`)
      created = await createStage({
        container: el,
        set: built?.set ?? opts.set,
        staging: built?.staging ?? opts.staging,
        tier: opts.tier ?? "auto",
        flags: { ...built?.flags, ...opts.flags },
        onProgress: setStatus,
      })
      if (cancelled) {
        created.dispose()
        return
      }
      if (built) {
        setStatus("Planting the wood")
        const off = await built.dress(created)
        // Taken down while it was being dressed: the stage has gone already.
        if (cancelled) return off()
        undress = off
      }
      await created.firstFrame
      if (cancelled) return
      stageRef.current = created
      setStage(created)
      ;(window as unknown as { __stage?: Stage }).__stage = created
      // The play screen places the cast and frames the opening view as it takes the stage. A few frames on, that is
      // drawn, and the old picture fades off it.
      for (let i = 0; i < 4 && !cancelled; i++) await new Promise((r) => requestAnimationFrame(r))
      if (!cancelled) lift(true)
    })().catch((err) => {
      console.error(err)
      if (!cancelled) {
        lift(false)
        setError(err instanceof Error ? err.message : String(err))
      }
    })
    return () => {
      cancelled = true
      // Leave the stage's last picture up while the next one loads.
      if (created && !cover.current && el.isConnected) {
        try {
          const still = created.picture()
          still.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none"
          el.appendChild(still)
          cover.current = still
        } catch {
          // A stage that cannot draw any more is simply taken down.
        }
      }
      undress?.()
      created?.dispose()
      stageRef.current = null
      setStage(null)
      const w = window as unknown as { __stage?: Stage }
      if (w.__stage === created) delete w.__stage
    }
  }, [container, opts])

  return { stage, stageRef, status, error }
}
