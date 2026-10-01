"use client"

// The d20 lab: takes on the die and its roll, in the stage's colours, each rolled on its own or all together. In both
// the number stays upright and changes in place, slowing as the die settles.
//   Outline   a real d20's silhouette (components/stage/d20.tsx), tumbling in 3D; the roll card's die
//   3D d20    a real icosahedron in three.js, shaded with no edge lines, that tumbles and settles with a face toward you

import { type ReactNode, useEffect, useRef, useState } from "react"
import { D20Shape, D20Solid } from "@/components/stage/d20"
import { Pill } from "@/components/stage/hud"
import { cn } from "@/lib/utils"

const SECONDS = 1.2

// Runs the number for one roll: random faces at a slowing pace, then the result.
function useRoll(onDone?: (n: number) => void) {
  const [shown, setShown] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const roll = () => {
    if (rolling) return
    if (timer.current) clearTimeout(timer.current)
    setRolling(true)
    let elapsed = 0
    let delay = 45
    const tick = () => {
      elapsed += delay
      if (elapsed >= SECONDS * 1000) {
        const n = 1 + Math.floor(Math.random() * 20)
        setShown(n)
        setRolling(false)
        onDone?.(n)
        return
      }
      setShown(1 + Math.floor(Math.random() * 20))
      delay *= 1.13
      timer.current = setTimeout(tick, delay)
    }
    tick()
  }
  return { shown, rolling, roll }
}

function Number_({ shown, rolling, size = 32 }: { shown: number | null; rolling: boolean; size?: number }) {
  return (
    <span
      key={shown ?? "roll"}
      className={cn("relative font-serif leading-none text-stage-parchment [text-shadow:0_1px_3px_#000d]", rolling ? "d20-flip" : shown !== null && "d20-land")}
      style={{ fontSize: shown === null ? 11 : size, letterSpacing: shown === null ? "0.2em" : undefined }}
    >
      {shown ?? "ROLL"}
    </span>
  )
}

const dieBox = "relative grid h-[110px] w-[110px] place-items-center [filter:drop-shadow(0_0_14px_#e3b67c40)_drop-shadow(0_3px_6px_#000b)]"

function Tumble({ go }: { go: number }) {
  const { shown, rolling, roll } = useRoll()
  useRollOn(go, roll)
  return (
    <button type="button" onClick={roll} className={dieBox} aria-label="Roll">
      <span className={cn("absolute inset-0", rolling && "d20-tumble")}>
        <D20Shape className="absolute inset-0 h-full w-full" />
      </span>
      <Number_ shown={shown} rolling={rolling} size={34} />
    </button>
  )
}

// The real d20 (the roll card's): a shaded icosahedron that tumbles and settles with a face toward you.
function Solid({ go }: { go: number }) {
  const { shown, rolling, roll } = useRoll()
  const [tumble, setTumble] = useState(0)
  const go2 = () => {
    if (rolling) return
    setTumble((k) => k + 1)
    roll()
  }
  useRollOn(go, go2)
  return (
    <button type="button" onClick={go2} className={cn(dieBox, "[filter:drop-shadow(0_3px_6px_#000b)]")} aria-label="Roll">
      <D20Solid size={110} roll={tumble} seconds={SECONDS} className="absolute inset-0" />
      <span className="mt-[4%]">
        <Number_ shown={shown} rolling={rolling} size={24} />
      </span>
    </button>
  )
}

// "Roll all" bumps `go`; each die rolls when it changes.
function useRollOn(go: number, roll: () => void) {
  const first = useRef(true)
  // Rolls on each bump, not when the roll function changes.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    roll()
  }, [go])
}

function Take({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return (
    <div className="stage-grain flex flex-col items-center gap-4 rounded-md border border-stage-line/25 bg-stage-panel/95 px-6 pt-6 pb-5">
      <div className="grid h-[130px] place-items-center">{children}</div>
      <div className="text-center">
        <div className="font-display text-[18px] text-[#f3d6a6]">{name}</div>
        <div className="mt-1 max-w-[200px] font-serif text-[12px] leading-snug text-stage-muted">{note}</div>
      </div>
    </div>
  )
}

export function DiceLab() {
  const [go, setGo] = useState(0)
  return (
    <main className="min-h-screen bg-stage-ink px-8 py-10 font-sans text-stage-cream">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <div className="font-sans text-[9px] font-medium tracking-[0.26em] text-stage-gold uppercase">Stageview · roll card</div>
            <h1 className="mt-1.5 font-display text-[30px]">The d20</h1>
          </div>
          <Pill active className="rounded-full px-6 py-2 font-display text-[13px] font-bold tracking-[0.12em]" onClick={() => setGo((g) => g + 1)}>
            Roll all
          </Pill>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-5">
          <Take name="Outline" note="A real d20's silhouette, tumbling in 3D; the number flips in place.">
            <Tumble go={go} />
          </Take>
          <Take name="3D d20" note="A real twenty-sided die, shaded with no lines, that tumbles and settles with a face toward you. On the roll card.">
            <Solid go={go} />
          </Take>
        </div>
      </div>
    </main>
  )
}
