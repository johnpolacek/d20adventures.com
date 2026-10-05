"use client"

// A dice roll in the narration, as the hero of its paragraph: the d20 tumbles and lands on the natural roll, the
// modifier and the total follow against the DC, and the verdict stamps in. A natural 20 or 1 that decides the roll is
// called out as a critical. Reduced motion shows the result at once.

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { D20Solid } from "./d20"
import { eyebrow } from "./hud"

export interface RollResultData {
  character: string
  check: string
  natural: number
  modifier?: number
  total: number
  dc: number
  success: boolean
  portrait?: string
}

// When each part arrives, in ms from the start: the die lands, the total follows, then the verdict.
const LAND = 1250
const TOTAL = LAND + 350
const VERDICT = TOTAL + 450
export const ROLL_SECONDS = (VERDICT + 900) / 1000

export function RollResult({ roll, compact = false }: { roll: RollResultData; compact?: boolean }) {
  const [step, setStep] = useState(0)
  const [face, setFace] = useState(() => 1 + Math.floor(Math.random() * 20))
  const [tumble, setTumble] = useState(0)
  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFace(roll.natural)
      return void setStep(3)
    }
    setTumble((k) => k + 1)
    // The number flickers while the die tumbles, slowing as it settles.
    const timers: ReturnType<typeof setTimeout>[] = []
    let at = 0
    for (let delay = 45; at + delay < LAND; delay *= 1.14) {
      at += delay
      timers.push(setTimeout(() => setFace(1 + Math.floor(Math.random() * 20)), at))
    }
    timers.push(
      setTimeout(() => {
        setFace(roll.natural)
        setStep(1)
      }, LAND)
    )
    timers.push(setTimeout(() => setStep(2), TOTAL))
    timers.push(setTimeout(() => setStep(3), VERDICT))
    return () => {
      for (const t of timers) clearTimeout(t)
    }
  }, [roll.natural])

  const crit = roll.natural === 20 && roll.success ? "high" : roll.natural === 1 && !roll.success ? "low" : null
  const verdict = crit === "high" ? "Critical success" : crit === "low" ? "Critical failure" : roll.success ? "Success" : "Failure"
  const margin = roll.total - roll.dc
  const tone = roll.success ? (crit ? "#ffd88a" : "#b7d38a") : crit ? "#ff6a4a" : "#e39a7c"
  const landed = step >= 1
  const size = compact ? 72 : 112
  const mod = roll.modifier ?? 0

  return (
    <div className={cn("flex items-center", compact ? "gap-3" : "gap-5")}>
      <span className="sr-only">
        {roll.character} rolled {roll.check}: {roll.natural}
        {roll.modifier !== undefined ? ` plus ${mod} makes ${roll.total}` : ""} against DC {roll.dc}. {verdict}.
      </span>
      {/* The die, glowing in the verdict's colour once it lands, with rays behind a natural 20. */}
      <div aria-hidden="true" className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        {crit === "high" && step >= 3 && <div className="roll-rays absolute -inset-6 rounded-full" />}
        <div
          className="absolute inset-0 transition-[filter] duration-500"
          style={{ filter: landed ? `drop-shadow(0 0 ${crit ? 22 : 12}px ${tone}${crit ? "cc" : "80"}) drop-shadow(0 3px 6px #000c)` : "drop-shadow(0 3px 6px #000c)" }}
        >
          <D20Solid size={size} roll={tumble} />
        </div>
        <span
          key={landed ? "landed" : face}
          className={cn(
            "relative font-serif font-bold leading-none tabular-nums [text-shadow:0_1px_4px_#000,0_0_2px_#000]",
            landed ? "d20-land" : "d20-flip",
            compact ? "text-[24px]" : "text-[40px]",
            crit === "high" && landed ? "text-[#ffe2a0]" : crit === "low" && landed ? "text-[#ff9a80]" : "text-stage-parchment"
          )}
        >
          {face}
        </span>
      </div>

      <div className="min-w-0 flex-1" aria-hidden="true">
        <div className={cn(eyebrow, "flex items-center gap-2 truncate")}>
          {roll.portrait && (
            // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
            <img src={roll.portrait} alt="" className="h-6 w-6 shrink-0 rounded-full border border-stage-gold/60 object-cover object-top" />
          )}
          <span className="truncate">
            {roll.character.split(" ")[0]} · {roll.check}
          </span>
        </div>
        {/* natural + modifier = total, against the DC. */}
        <div className={cn("flex items-baseline gap-2 font-serif font-semibold tabular-nums text-stage-cream", compact ? "mt-0.5" : "mt-1.5")}>
          <span className={cn(compact ? "text-[18px]" : "text-[24px]", !landed && "opacity-30")}>{landed ? roll.natural : "?"}</span>
          {roll.modifier !== undefined && (
            <span className={cn("transition-opacity duration-300", step >= 2 ? "opacity-100" : "opacity-0")}>
              <span className={cn("text-stage-muted", compact ? "text-[14px]" : "text-[18px]")}>{mod < 0 ? "−" : "+"}</span>
              <span className={cn("ml-2", compact ? "text-[18px]" : "text-[24px]")}>{Math.abs(mod)}</span>
            </span>
          )}
          <span className={cn("transition-opacity duration-300", step >= 2 ? "opacity-100" : "opacity-0")}>
            <span className={cn("text-stage-muted", compact ? "text-[14px]" : "text-[18px]")}>=</span>
            <span className={cn("ml-2 font-bold text-stage-gold", compact ? "text-[26px]" : "text-[38px]", step >= 2 && "roll-rise")}>{roll.total}</span>
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 self-center rounded-sm border border-stage-line/25 font-sans tracking-[0.2em] text-stage-muted uppercase",
              compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"
            )}
          >
            DC <span className={cn("font-serif font-semibold tracking-normal text-stage-cream", compact ? "text-[13px]" : "text-[17px]")}>{roll.dc}</span>
          </span>
        </div>
        {/* The verdict, stamped in, and by how much the roll made or missed the DC. */}
        <div className={cn("flex items-center gap-3", compact ? "mt-1" : "mt-2", step >= 3 ? "opacity-100" : "opacity-0")}>
          <span
            className={cn(
              "roll-stamp inline-block shrink-0 whitespace-nowrap rounded-[3px] border-2 font-display font-bold tracking-[0.1em] [word-spacing:0.35em] uppercase",
              compact ? "px-2 py-0 text-[10px]" : crit ? "px-2.5 py-0.5 text-[13px]" : "px-3 py-0.5 text-[15px]",
              step >= 3 && "roll-stamp-in"
            )}
            style={{ color: tone, borderColor: tone, boxShadow: `0 0 ${crit ? 18 : 10}px ${tone}55, inset 0 0 8px ${tone}33`, textShadow: `0 0 8px ${tone}66` }}
          >
            {verdict}
          </span>
          <span className={cn("min-w-0 truncate font-serif text-stage-muted italic", compact ? "text-[11px]" : "text-[13px]")}>
            {margin === 0 ? "exactly the DC" : margin > 0 ? `beat the DC by ${margin}` : `missed by ${-margin}`}
          </span>
        </div>
      </div>
    </div>
  )
}
