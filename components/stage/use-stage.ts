"use client"

import type { Flags, Stage, TierName } from "@d20/stage"
import { type RefObject, useEffect, useRef, useState } from "react"

// Creates a Stage in `container` for a set (and optional staging) and disposes it on unmount. three.js loads inside the
// effect, so nothing WebGL touches the server bundle.
export function useStage(container: RefObject<HTMLDivElement | null>, opts: { set: unknown; staging?: unknown; tier?: TierName | "auto"; flags?: Partial<Flags> } | null) {
  const stageRef = useRef<Stage | null>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [status, setStatus] = useState("Loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = container.current
    if (!el || !opts) return
    let cancelled = false
    let created: Stage | null = null
    // A new set starts clean: no error or status left over from the one it replaces.
    setError(null)
    setStatus("Loading")
    ;(async () => {
      const { createStage } = await import("@d20/stage")
      created = await createStage({ container: el, set: opts.set, staging: opts.staging, tier: opts.tier ?? "auto", flags: opts.flags, onProgress: setStatus })
      if (cancelled) {
        created.dispose()
        return
      }
      await created.firstFrame
      if (cancelled) return
      stageRef.current = created
      setStage(created)
      ;(window as unknown as { __stage?: Stage }).__stage = created
    })().catch((err) => {
      console.error(err)
      if (!cancelled) setError(err instanceof Error ? err.message : String(err))
    })
    return () => {
      cancelled = true
      created?.dispose()
      stageRef.current = null
      setStage(null)
      const w = window as unknown as { __stage?: Stage }
      if (w.__stage === created) delete w.__stage
    }
  }, [container, opts])

  return { stage, stageRef, status, error }
}
