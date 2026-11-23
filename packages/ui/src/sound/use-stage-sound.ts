"use client"

import type { AmbienceBed, Stage } from "@d20/stage"
import { useEffect } from "react"
import { setAmbience, setAmbienceMix } from "./ambience"
import { effectSound, preloadFx } from "./fx"

// Near the water the river comes up and the land's beds go back; up the bank among the trees it is the other way about.
// `water` is 1 at the water's edge and 0 from 15 metres off.
const nearWater = (water: number) => {
  const land = 1.15 - 0.35 * water
  return { river: 0.45 + 0.85 * water, wind: land, night: land, birds: land, dawn: land }
}

// A stage's sound: its set's ambience while it is shown, and its effects as they play. Ambience goes quiet when the
// stage goes. `on` false keeps the stage silent, as a preview should be.
export function useStageSound(stage: Stage | null, on = true) {
  useEffect(() => {
    if (!stage || !on) return
    preloadFx()
    setAmbience(stage.set.ambience ?? [])
    // A room with beds of its own is heard while the camera is in it, the set's again once it leaves.
    const off = stage.listen((e) => {
      if (e.type === "room") setAmbience((e.ambience ?? stage.set.ambience ?? []) as AmbienceBed[])
      else if (e.type === "place") setAmbienceMix(nearWater(e.water))
      else effectSound(e)
    })
    return () => {
      off()
      setAmbienceMix({})
      setAmbience([])
    }
  }, [stage, on])
}
