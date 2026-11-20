"use client"

import type { EffectEvent } from "@d20/stage"
import { AMBIENCE_BEDS, type AmbienceBed } from "@d20/stage/spec/set"
import { Button } from "@d20/ui/button"
import { setAmbience } from "@d20/ui/sound/ambience"
import { rattle, type Verdict, verdict } from "@d20/ui/sound/dice"
import { effectSound, preloadFx } from "@d20/ui/sound/fx"
import { setSoundOn, soundOn } from "@d20/ui/sound/settings"
import { useEffect, useState } from "react"

const KINDS = ["arrow", "bolt", "beam", "burst", "aura", "sparkles", "slash", "impact", "mist"] as const
const ELEMENTS = [undefined, "fire", "frost", "lightning", "radiant", "nature", "shadow", "arcane"] as const
const PROPS = ["scroll", "pouch", "key", "book", "blade"] as const
const VERDICTS: Verdict[] = ["success", "failure", "critical-success", "critical-failure"]
const MISSILES = new Set(["arrow", "bolt"])

function fire(kind: (typeof KINDS)[number], element: (typeof ELEMENTS)[number], struck: boolean) {
  const e = (phase: "start" | "land"): EffectEvent => ({ type: "effect", kind, element, phase, struck })
  effectSound(e("start"))
  if (MISSILES.has(kind)) setTimeout(() => effectSound(e("land")), 450)
}

export function SoundLab() {
  const [on, setOn] = useState(true)
  const [element, setElement] = useState<(typeof ELEMENTS)[number]>(undefined)
  const [beds, setBeds] = useState<AmbienceBed[]>([])
  useEffect(() => {
    setOn(soundOn())
    preloadFx()
    return () => setAmbience([])
  }, [])
  const toggleBed = (b: AmbienceBed) => {
    const next = beds.includes(b) ? beds.filter((x) => x !== b) : [...beds, b].slice(-3)
    setBeds(next)
    setAmbience(next)
  }
  const row = "flex flex-wrap items-center gap-2"
  const head = "w-24 text-sm font-semibold"
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-8 pt-28 pb-8">
      <div className={row}>
        <span className={head}>Sound</span>
        <Button
          variant={on ? "brick" : "outline"}
          onClick={() => {
            setSoundOn(!on)
            setOn(!on)
          }}
        >
          {on ? "On" : "Off"}
        </Button>
      </div>
      <div className={row}>
        <span className={head}>Dice</span>
        <Button
          variant="outline"
          onClick={() => {
            const stop = rattle()
            setTimeout(stop, 1400)
          }}
        >
          roll
        </Button>
        {VERDICTS.map((v) => (
          <Button key={v} variant="outline" onClick={() => verdict(v)}>
            {v}
          </Button>
        ))}
      </div>
      <div className={row}>
        <span className={head}>Element</span>
        {ELEMENTS.map((e) => (
          <Button key={e ?? "none"} variant={element === e ? "brick" : "outline"} onClick={() => setElement(e)}>
            {e ?? "none"}
          </Button>
        ))}
      </div>
      <div className={row}>
        <span className={head}>Hit</span>
        {KINDS.map((k) => (
          <Button key={k} variant="outline" onClick={() => fire(k, element, true)}>
            {k}
          </Button>
        ))}
      </div>
      <div className={row}>
        <span className={head}>Miss</span>
        {KINDS.map((k) => (
          <Button key={k} variant="outline" onClick={() => fire(k, element, false)}>
            {k}
          </Button>
        ))}
      </div>
      <div className={row}>
        <span className={head}>Prop</span>
        {PROPS.map((p) => (
          <Button key={p} variant="outline" onClick={() => effectSound({ type: "prop", kind: p, passed: true })}>
            {p}
          </Button>
        ))}
      </div>
      <div className={row}>
        <span className={head}>Ambience</span>
        {AMBIENCE_BEDS.map((b) => (
          <Button key={b} variant={beds.includes(b) ? "brick" : "outline"} onClick={() => toggleBed(b)}>
            {b}
          </Button>
        ))}
      </div>
    </div>
  )
}
