"use client"

import type { Flags, Stage, TierName } from "@d20/stage"
import { type RefObject, useEffect, useRef, useState } from "react"

/** The built looks a game plays its sets in. The app passes asset-library/play.ts, since that is not in this package. */
export interface PlayLooks<L> {
  playedLook: (set: string | undefined) => L | null
  builtPlay: (
    set: unknown,
    staging: unknown,
    look: L
  ) => Promise<{ set: unknown; staging: unknown; flags: Partial<Flags>; cards: string[]; dress: (stage: Stage) => Promise<() => void> } | null>
}

export interface StageOptions<L> {
  set: unknown
  staging?: unknown
  tier?: TierName | "auto"
  flags?: Partial<Flags>
  /** Loads the built looks. Without it every set shows as painted. */
  play?: () => Promise<PlayLooks<L>>
}

// One stage builds at a time. A build cannot be stopped part way, so a scene that changes twice as a game opens (the
// old encounter's closing paragraphs, then the new one) built three stages at once, and the window dropped to 2 fps
// for ten seconds. Each build now waits for the last to finish, and one called off while it waited never starts.
let building: Promise<unknown> = Promise.resolve()

// Creates a Stage in `container` for a set (and optional staging) and disposes it on unmount. three.js loads inside the
// effect, so nothing WebGL touches the server bundle. A set the game plays as built is built from its look, with
// figures for its cast, in place of its paintings and cards.
// `hold` keeps the last picture up while there are no options because the next set is still on its way, such as while
// its files download, so the scene change never shows the new set before it is built and framed.
export function useStage<L>(container: RefObject<HTMLDivElement | null>, opts: StageOptions<L> | null, hold = false) {
  const stageRef = useRef<Stage | null>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [status, setStatus] = useState("Loading")
  const [error, setError] = useState<string | null>(null)
  // The last picture of the stage being replaced, held over the container until the next one is built, dressed and
  // framed. Without it the scene change shows black, then the new set before its trees are planted and before the
  // play screen has put the camera where the scene opens.
  const cover = useRef<HTMLCanvasElement | null>(null)

  const lift = (fade: boolean) => {
    const c = cover.current
    cover.current = null
    if (!c) return
    if (!fade) return void c.remove()
    c.style.transition = "opacity 350ms ease"
    c.style.opacity = "0"
    setTimeout(() => c.remove(), 400)
  }

  // With nothing to build and nothing to hold for, the old picture comes down. A change of hold alone never rebuilds
  // the stage.
  useEffect(() => {
    if (!opts && !hold) lift(false)
  }, [opts, hold])

  useEffect(() => {
    const el = container.current
    if (!el || !opts) return
    let cancelled = false
    let created: Stage | null = null
    let undress: (() => void) | null = null
    // A new set starts clean: no error or status left over from the one it replaces.
    setError(null)
    setStatus("Loading")
    const before = building
    const build = (async () => {
      await before.catch(() => {})
      if (cancelled) return
      const [{ createStage }, play] = await Promise.all([import("@d20/stage"), opts.play?.()])
      if (cancelled) return
      const look = play?.playedLook((opts.staging as { set?: string } | undefined)?.set) ?? null
      const built = play && look ? await play.builtPlay(opts.set, opts.staging, look) : null
      if (cancelled) return
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
    building = build
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
