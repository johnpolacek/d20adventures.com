"use client"

// Dialogue on the stage: a bubble anchored above the speaker's head (following them as the camera moves) and a portrait
// plate in the corner of the visible stage, the CRPG split used by Baldur's Gate and Disco Elysium. `compact` is for
// phones on their side.

import { useEffect, useRef } from "react"
import type { Stage } from "@/lib/stage"
import { cn } from "@/lib/utils"

export interface SpokenLine {
  key: number
  castId: string
  name: string
  role?: string
  portrait?: string
  text: string
}

export function SpeechBubble({ stage, line, compact = false }: { stage: Stage; line: SpokenLine; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const follow = () => {
      raf = requestAnimationFrame(follow)
      const p = stage.project(line.castId)
      const el = ref.current
      if (!p || !el) return
      el.style.opacity = p.visible ? "1" : "0"
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, calc(-100% - 10px)) scale(${Math.min(1, Math.max(0.7, 14 / p.distance)).toFixed(3)})`
    }
    follow()
    return () => cancelAnimationFrame(raf)
  }, [stage, line.castId])
  return (
    <div
      ref={ref}
      className={cn("pointer-events-none absolute top-0 left-0 z-20 origin-bottom opacity-0 transition-opacity duration-300", compact ? "max-w-[220px]" : "max-w-[min(300px,40vw)]")}
      data-bubble={line.castId}
    >
      <div className={cn("rounded-xl border border-amber-900/40 bg-[#f4ead6] font-serif leading-snug text-[#2a1f14] shadow-lg", compact ? "px-2 py-1 text-[12px]" : "px-3 py-1.5 text-[15px]")}>
        {line.text}
      </div>
      <div className="mx-auto -mt-px h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-[#f4ead6]" />
    </div>
  )
}

export function PortraitPlate({ line, compact = false }: { line: SpokenLine; compact?: boolean }) {
  return (
    <div
      key={line.key}
      className={cn(
        "fade-in pointer-events-none flex items-stretch overflow-hidden rounded-xl bg-black/70 ring ring-primary-700 backdrop-blur-sm",
        compact ? "max-w-[min(300px,calc(100vw-7rem))]" : "max-w-[440px]"
      )}
      data-plate={line.castId}
    >
      {line.portrait && (
        // biome-ignore lint/performance/noImgElement: portrait art from the stage assets, not a Next image
        <img src={line.portrait} alt="" className={cn("shrink-0 object-cover object-top", compact ? "h-16 w-12" : "h-28 w-24")} />
      )}
      <div className={cn("flex min-w-0 flex-col justify-center gap-0.5", compact ? "px-2 py-1" : "px-3 py-2")}>
        <div className={cn("font-display font-bold text-amber-300", compact ? "text-xs" : "text-sm")}>{line.name}</div>
        {line.role && !compact && <div className="text-xxs uppercase tracking-wider text-primary-300">{line.role}</div>}
        <div className={cn("font-serif leading-snug text-white", compact ? "line-clamp-2 text-xs" : "line-clamp-3 text-base")}>“{line.text}”</div>
      </div>
    </div>
  )
}
