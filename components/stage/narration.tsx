"use client"

// The narrative, one paragraph at a time, in a panel that eases to each paragraph's height: the old text fades out, the
// panel resizes, and the new text fades in. Dots mark the paragraph's place in the turn.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { eyebrow, panel } from "./hud"

export function Narration({
  heading,
  text,
  index,
  count,
  hidden = false,
  compact = false,
  action,
}: {
  heading: string
  text: string | undefined
  index: number
  count: number
  hidden?: boolean
  compact?: boolean
  action?: ReactNode
}) {
  const [shown, setShown] = useState(text)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (text === undefined) return
    setVisible(false)
    const swap = setTimeout(() => setShown(text), 300)
    const show = setTimeout(() => setVisible(true), 480)
    return () => {
      clearTimeout(swap)
      clearTimeout(show)
    }
  }, [text])

  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <section
      aria-live="polite"
      className={cn(panel, "overflow-hidden transition-[height,opacity] duration-500 ease-out", hidden ? "pointer-events-none opacity-0" : "pointer-events-auto")}
      // The panel's 1px border sits outside the measured content.
      style={{ height: height === undefined ? undefined : height + 2 }}
    >
      <div ref={inner} className={compact ? "px-3 pt-2 pb-2" : "px-5 pt-4 pb-3"}>
        <div className={cn(eyebrow, "flex items-center gap-3 before:h-px before:w-6 before:bg-stage-gold", compact ? "mb-1" : "mb-2")}>{heading}</div>
        <p className={cn("font-serif text-stage-cream transition-opacity duration-300", visible ? "opacity-100" : "opacity-0", compact ? "text-[12px] leading-snug" : "text-[15px] leading-[1.65]")}>
          {shown}
        </p>
        <div className={cn("flex items-center justify-between", compact ? "mt-1.5" : "mt-3")}>
          <div className="flex gap-1.5" role="presentation">
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className={cn("h-1.5 w-1.5 rounded-full transition-colors duration-500", i <= index ? "bg-stage-gold" : "bg-stage-line/20")} />
            ))}
          </div>
          {action}
        </div>
      </div>
    </section>
  )
}
