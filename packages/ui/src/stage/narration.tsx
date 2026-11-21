"use client"

// The narrative, one paragraph at a time, in a panel that eases to each paragraph's height: the old text fades out, the
// panel resizes, and the new text fades in. A paragraph that is a dice roll shows the roll itself (see RollResult), and
// one that is a class feature used shows it as a small entry (see FeatureEntry). Dots mark the paragraph's place in the turn; the controls replay the turn,
// step back, move on (Continue when stepping through, the next paragraph when it plays itself), or skip to the end.
// Given a reading time, Continue fills as the time runs and then presses itself. A click on the words holds it, and
// so does stepping back, until Continue is pressed.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button, type ButtonProps, epicReducedButtonStyle } from "../button"
import { Tip } from "../tooltip"
import { cn, entrance, type MotionProps } from "../utils"
import { Chevron, eyebrow, panel } from "./hud"
import { FeatureEntry } from "./roll-parts"
import type { RollPace } from "./roll-pace"
import { RollResult } from "./roll-result"
import type { FeatureView, RollView } from "./roll-view"

// A paragraph gives way to the next: the words fade out, the panel takes its new height, and the new words fade in.
const SWAP_MS = 150
const SHOW_MS = 260

function Control({ label, children, ...rest }: Omit<ButtonProps, "variant" | "size"> & { label: string; children: ReactNode }) {
  return (
    <Tip label={label}>
      <Button
        variant="plain"
        type="button"
        aria-label={label}
        className="stage-navy grid h-7 w-7 place-items-center rounded-full border border-foreground/25 text-foreground transition-[filter,border-color,background-color,scale] duration-150 ease-snap hover:border-accent enabled:active:scale-90 disabled:cursor-default disabled:opacity-35 [&_svg]:h-3 [&_svg]:w-3"
        {...rest}
      >
        {children}
      </Button>
    </Tip>
  )
}

export function Narration({
  heading,
  text,
  roll,
  rollPace,
  feature,
  index,
  count,
  hidden = false,
  compact = false,
  onReplay,
  onBack,
  onNext,
  onSkip,
  step = false,
  onContinue,
  autoMs,
  className,
  style,
  onAnimationEnd,
}: MotionProps & {
  heading: string
  text: string | undefined
  // The paragraph's dice roll, when it is one.
  roll?: RollView
  // How fast that roll plays. In full without it.
  rollPace?: RollPace
  // The paragraph's class feature used, when it is one.
  feature?: FeatureView
  index: number
  count: number
  hidden?: boolean
  compact?: boolean
  onReplay: () => void
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  step?: boolean
  onContinue?: () => void
  // Stepping through, Continue presses itself after this long.
  autoMs?: number
}) {
  const [shown, setShown] = useState(text)
  const [shownRoll, setShownRoll] = useState(roll)
  const [shownPace, setShownPace] = useState(rollPace)
  const [shownFeature, setShownFeature] = useState(feature)
  // The heading changes with its paragraph, so a new encounter's title never sits over the last one's closing words.
  const [shownHeading, setShownHeading] = useState(heading)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (text === undefined) return
    setVisible(false)
    const swap = setTimeout(() => {
      setShown(text)
      setShownRoll(roll)
      setShownPace(rollPace)
      setShownFeature(feature)
      setShownHeading(heading)
    }, SWAP_MS)
    const show = setTimeout(() => setVisible(true), SHOW_MS)
    return () => {
      clearTimeout(swap)
      clearTimeout(show)
    }
  }, [text, roll, rollPace, feature, heading])

  const timed = step && autoMs !== undefined
  // The time runs only while the words are up, so a paragraph still fading in has not started.
  const running = timed && visible && !hidden
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const press = useRef(onContinue)
  press.current = onContinue
  const fill = useRef<HTMLSpanElement>(null)
  const sync = useRef<() => void>(undefined)
  useEffect(() => {
    const el = fill.current
    if (!running || !el?.animate) return
    const run = el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: autoMs, fill: "forwards" })
    run.onfinish = () => press.current?.()
    // A window out of sight holds the time too, so nothing is passed unread.
    const hold = () => {
      if (run.playState === "finished") return
      if (pausedRef.current || document.hidden) run.pause()
      else run.play()
    }
    hold()
    sync.current = hold
    document.addEventListener("visibilitychange", hold)
    return () => {
      document.removeEventListener("visibilitychange", hold)
      sync.current = undefined
      run.cancel()
    }
  }, [running, autoMs, index, shown])
  useEffect(() => sync.current?.(), [paused])

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
      className={cn(
        panel,
        "overflow-hidden transition-[height,opacity] duration-200 ease-out",
        hidden ? "pointer-events-none opacity-0" : "pointer-events-auto",
        entrance("enter-rise", className)
      )}
      // The panel's 1px border sits outside the measured content.
      style={{ ...style, height: height === undefined ? undefined : height + 2 }}
      onAnimationEnd={onAnimationEnd}
    >
      <div ref={inner} className={compact ? "px-3 pt-2 pb-2" : "px-5 pt-4 pb-3"}>
        <div className={cn(eyebrow, "flex items-center gap-3 before:h-px before:w-6 before:bg-accent", compact ? "mb-1" : "mb-2")}>
          {shownHeading}
          {timed && paused && <span className="ml-auto text-muted-foreground">Paused</span>}
        </div>
        {shownRoll ? (
          <div className={cn("transition-opacity duration-150", visible ? "opacity-100" : "opacity-0", compact ? "py-0.5" : "py-1")}>
            {visible && <RollResult key={`${index}-${shown}`} roll={shownRoll} compact={compact} pace={shownPace} />}
          </div>
        ) : shownFeature ? (
          <div className={cn("transition-opacity duration-150", visible ? "opacity-100" : "opacity-0", compact ? "py-0.5" : "py-1")}>
            <FeatureEntry feature={shownFeature} compact={compact} />
          </div>
        ) : (
          <p
            className={cn(
              "font-serif text-foreground transition-opacity duration-150",
              visible ? "opacity-100" : "opacity-0",
              compact ? "text-2xs leading-snug" : "text-sm leading-[1.65]",
              timed && "cursor-pointer"
            )}
            onClick={timed ? () => setPaused((p) => !p) : undefined}
          >
            {shown}
          </p>
        )}
        <div className={cn("flex items-center justify-between gap-3", compact ? "mt-1.5" : "mt-3")}>
          {/* Long narrations get smaller dots, so the row stays one line beside the controls. */}
          <div className={cn("flex min-w-0 flex-wrap", count > 10 ? "gap-[3px]" : "gap-1")} role="presentation">
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className={cn("rounded-full transition-colors duration-150", count > 10 ? "h-1 w-1" : "h-1.5 w-1.5", i <= index ? "bg-accent" : "bg-foreground/20")} />
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Control
              label="Replay the turn"
              onClick={() => {
                setPaused(false)
                onReplay()
              }}
            >
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <path d="M2.2 6a3.8 3.8 0 1 0 1.2-2.8" />
                <path d="M2 1.4v2.4h2.4" />
              </svg>
            </Control>
            <Control
              label="Previous paragraph"
              onClick={() => {
                setPaused(true)
                onBack()
              }}
              disabled={index <= 0}
            >
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M7.5 2.5 4 6l3.5 3.5" />
              </svg>
            </Control>
            {step ? (
              // Taller than the row: the negative margin keeps the row at its height.
              <Button
                variant="epic"
                size="xs"
                className={cn("relative ml-1 overflow-hidden", compact ? "px-4 py-0.5 text-3xs" : "-my-[3px] border-[3px] py-2 text-3xs/4")}
                style={compact ? undefined : epicReducedButtonStyle}
                onClick={() => {
                  setPaused(false)
                  onContinue?.()
                }}
              >
                {timed && <span ref={fill} aria-hidden="true" className="pointer-events-none absolute inset-0 origin-left bg-white/60 mix-blend-overlay" style={{ transform: "scaleX(0)" }} />}
                <span className="relative flex items-center gap-1.5">
                  Continue
                  <Chevron />
                </span>
              </Button>
            ) : (
              <Control label="Next paragraph" onClick={onNext}>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M4.5 2.5 8 6 4.5 9.5" />
                </svg>
              </Control>
            )}
            <Control label="Skip to the End" onClick={onSkip}>
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M2.5 2.5 6 6 2.5 9.5M6.5 2.5 10 6 6.5 9.5" />
              </svg>
            </Control>
          </div>
        </div>
      </div>
    </section>
  )
}
