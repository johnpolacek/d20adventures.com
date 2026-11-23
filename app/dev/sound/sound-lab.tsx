"use client"

import type { EffectEvent } from "@d20/stage"
import { AMBIENCE_BEDS, type AmbienceBed } from "@d20/stage/spec/set"
import { Button } from "@d20/ui/button"
import { setAmbience } from "@d20/ui/sound/ambience"
import { duck } from "@d20/ui/sound/engine"
import { rattle, type Verdict, verdict } from "@d20/ui/sound/dice"
import { effectSound, preloadFx } from "@d20/ui/sound/fx"
import { setSoundOn, soundOn } from "@d20/ui/sound/settings"
import { useEffect, useRef, useState } from "react"

const KINDS = ["arrow", "bolt", "beam", "burst", "aura", "sparkles", "slash", "impact", "mist"] as const
const ELEMENTS = [undefined, "fire", "frost", "lightning", "radiant", "nature", "shadow", "arcane"] as const
const PROPS = ["scroll", "pouch", "key", "book", "blade"] as const
const VERDICTS: Verdict[] = ["success", "failure", "critical-success", "critical-failure"]
const MISSILES = new Set(["arrow", "bolt"])

// The narrator plays only in the desktop app, so here a line is stood in by holding the duck for as long as it would
// speak: two paragraphs with a short pause between, heard as one dip.
function line(seconds: number[], gap: number) {
  let t = 0
  for (const s of seconds) {
    setTimeout(() => {
      const release = duck()
      setTimeout(release, s * 1000)
    }, t * 1000)
    t += s + gap
  }
}

function fire(kind: (typeof KINDS)[number], element: (typeof ELEMENTS)[number], struck: boolean) {
  const e = (phase: "start" | "land"): EffectEvent => ({ type: "effect", kind, element, phase, struck })
  effectSound(e("start"))
  if (MISSILES.has(kind)) setTimeout(() => effectSound(e("land")), 450)
}

export function SoundLab() {
  const [on, setOn] = useState(true)
  const [element, setElement] = useState<(typeof ELEMENTS)[number]>(undefined)
  const [beds, setBeds] = useState<AmbienceBed[]>([])
  const held = useRef<(() => void) | null>(null)
  const [holding, setHolding] = useState(false)
  useEffect(() => {
    setOn(soundOn())
    preloadFx()
    return () => {
      held.current?.()
      setAmbience([])
    }
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
          variant="outline" active={on}
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
          <Button key={e ?? "none"} variant="outline" active={element === e} onClick={() => setElement(e)}>
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
          <Button key={b} variant="outline" active={beds.includes(b)} onClick={() => toggleBed(b)}>
            {b}
          </Button>
        ))}
      </div>
      <div className={row}>
        <span className={head}>Duck</span>
        <Button
          variant="outline"
          active={holding}
          onClick={() => {
            if (held.current) {
              held.current()
              held.current = null
            } else held.current = duck()
            setHolding(!!held.current)
          }}
        >
          hold
        </Button>
        <Button variant="outline" onClick={() => line([4], 0)}>
          4 s line
        </Button>
        <Button variant="outline" onClick={() => line([4, 5], 1)}>
          two paragraphs
        </Button>
      </div>
    </div>
  )
}
