"use client"

import type { Stage } from "@d20/stage"
import { useEffect } from "react"
import { setAmbience } from "./ambience"
import { effectSound, preloadFx } from "./fx"

// A stage's sound: its set's ambience while it is shown, and its effects as they play. Ambience goes quiet when the
// stage goes. `on` false keeps the stage silent, as a preview should be.
export function useStageSound(stage: Stage | null, on = true) {
  useEffect(() => {
    if (!stage || !on) return
    preloadFx()
    setAmbience(stage.set.ambience ?? [])
    const off = stage.listen(effectSound)
    return () => {
      off()
      setAmbience([])
    }
  }, [stage, on])
}
