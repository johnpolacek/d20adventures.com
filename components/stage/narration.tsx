"use client"

// The narrative, one paragraph at a time, in a panel that eases to each paragraph's height: the old text fades out, the
// panel resizes, and the new text fades in. Dots mark the paragraph's place in the turn; the controls replay the turn,
// step back, move on (Continue when stepping through, which glows while the story waits on the reader; the next
// paragraph when it plays itself), or skip to the end.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { eyebrow, Pill, panel } from "./hud"

function Control({ label, children, ...rest }: React.ComponentProps<"button"> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="stage-leather grid h-7 w-7 place-items-center rounded-full border border-stage-line/25 text-stage-cream transition-[filter,border-color] hover:border-stage-gold disabled:cursor-default disabled:opacity-35 [&_svg]:h-3 [&_svg]:w-3"
      {...rest}
    >
      {children}
    </button>
  )
}

export function Narration({
  heading,
  text,
  index,
  count,
  hidden = false,
  compact = false,
  onReplay,
  onBack,
  onNext,
  onSkip,
  step = false,
  waiting = false,
  onContinue,
}: {
  heading: string
  text: string | undefined
  index: number
  count: number
  hidden?: boolean
  compact?: boolean
  onReplay: () => void
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  step?: boolean
  waiting?: boolean
  onContinue?: () => void
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
          <div className="flex items-center gap-1.5">
            <Control label="Replay the turn" onClick={onReplay}>
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <path d="M2.2 6a3.8 3.8 0 1 0 1.2-2.8" />
                <path d="M2 1.4v2.4h2.4" />
              </svg>
            </Control>
            <Control label="Previous paragraph" onClick={onBack} disabled={index <= 0}>
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M7.5 2.5 4 6l3.5 3.5" />
              </svg>
            </Control>
            {step ? (
              <Pill
                active
                className={cn(
                  "ml-1 rounded-full px-4 py-1 font-display text-[12px] font-bold tracking-[0.12em] transition-[filter,box-shadow]",
                  waiting && "shadow-[0_0_0_2px_#e3b67c55,0_0_18px_#e3b67c66]"
                )}
                onClick={onContinue}
              >
                Continue ▸
              </Pill>
            ) : (
              <Control label="Next paragraph" onClick={onNext}>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M4.5 2.5 8 6 4.5 9.5" />
                </svg>
              </Control>
            )}
            <Pill className="ml-1 rounded-full px-3.5 py-1" onClick={onSkip}>
              Skip ▸▸
            </Pill>
          </div>
        </div>
      </div>
    </section>
  )
}
