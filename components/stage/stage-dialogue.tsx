"use client"

// Dialogue on the stage, as in the Kordavos prototype: parchment bubbles anchored above whoever speaks (named characters
// get a brass edge), and a framed portrait plate that slides in on the speaker's side of the screen for named characters.

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export type Anchor = () => { x: number; y: number; visible: boolean; distance: number } | null
export interface Bubble {
  key: number
  anchor: Anchor
  text: string
  named: boolean
}

function BubbleView({ bubble, compact }: { bubble: Bubble; compact: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const follow = () => {
      raf = requestAnimationFrame(follow)
      const p = bubble.anchor()
      const el = ref.current
      if (!p || !el) return
      const on = p.visible && p.distance < 120
      el.style.opacity = on ? "1" : "0"
      if (on) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, calc(-100% - 8px)) scale(${Math.min(1, Math.max(0.6, 16 / p.distance)).toFixed(3)})`
    }
    follow()
    return () => cancelAnimationFrame(raf)
  }, [bubble])
  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-0 left-0 origin-bottom rounded-[10px] px-3 pt-2 pb-[9px] text-center font-serif leading-[1.4] text-[#2a1a10] italic opacity-0 shadow-[0_6px_18px_#0005] transition-opacity duration-200",
        "after:absolute after:bottom-[-7px] after:left-1/2 after:-ml-[7px] after:border-[7px] after:border-b-0 after:border-transparent",
        bubble.named ? "border border-stage-brass bg-[#fbf1dc] after:border-t-[#fbf1dc]" : "bg-stage-parchment/95 after:border-t-[#f3e6c8f2]",
        compact ? "max-w-[190px] text-[11px]" : cn("max-w-[240px]", bubble.named ? "text-[14px]" : "text-[13px]")
      )}
    >
      {bubble.text}
    </div>
  )
}

export function Bubbles({ bubbles, compact = false }: { bubbles: Bubble[]; compact?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-live="polite">
      {bubbles.map((b) => (
        <BubbleView key={b.key} bubble={b} compact={compact} />
      ))}
    </div>
  )
}

export interface PlateLine {
  key: number
  side: "left" | "right"
  name: string
  role?: string
  portrait?: string
  text: string
}

export function Plate({ line, compact = false }: { line: PlateLine; compact?: boolean }) {
  return (
    <div
      key={line.key}
      className={cn(
        "plate-in pointer-events-none absolute z-20 flex items-stretch rounded-[5px] stage-grain border border-stage-brass/60 bg-[#27190ff4] shadow-[0_0_0_3px_#1c1410c0,0_0_0_4px_#c79a5a44,0_18px_44px_#0008,inset_0_1px_0_#f0d6b214,inset_0_0_40px_#0000004d]",
        compact ? "bottom-[54px] w-[min(330px,46vw)] p-1.5" : "bottom-[122px] w-[min(410px,calc(100%-28px))] p-[11px]",
        line.side === "left" ? (compact ? "left-4" : "left-11") : compact ? "right-4" : "right-10"
      )}
      style={{ ["--plate-from" as string]: line.side === "left" ? "-70px" : "70px" }}
    >
      {line.portrait && (
        <div className={cn("relative flex-none border border-stage-brass bg-stage-ink p-[3px] shadow-[inset_0_0_0_1px_#000a,0_2px_8px_#0006]", compact ? "h-[74px] w-[58px]" : "h-[140px] w-[112px]")}>
          {/* biome-ignore lint/performance/noImgElement: portrait art from the stage assets */}
          <img src={line.portrait} alt="" className="block h-full w-full object-cover object-top [filter:sepia(.2)_saturate(.88)_contrast(1.02)_brightness(.98)]" />
          <div className="pointer-events-none absolute inset-[3px] shadow-[inset_0_0_20px_#1c1410aa,inset_0_0_0_1px_#f3d6a622]" />
        </div>
      )}
      <div className={cn("flex min-w-0 flex-col justify-center", compact ? "px-2.5" : "py-1 pr-2.5 pl-4")}>
        <div className={cn("font-serif leading-[1.1] text-[#f3d6a6]", compact ? "text-[15px]" : "text-[21px]")}>{line.name}</div>
        {line.role && !compact && <div className="mt-1 text-[8.5px] tracking-[0.22em] text-stage-gold uppercase">{line.role}</div>}
        <div
          className={cn(
            "border-t border-stage-brass/25 font-serif text-stage-cream italic",
            compact ? "mt-1.5 line-clamp-2 pt-1.5 text-[12px] leading-snug" : "mt-2.5 line-clamp-4 pt-2.5 text-[15px] leading-[1.45]"
          )}
        >
          “{line.text}”
        </div>
      </div>
    </div>
  )
}
