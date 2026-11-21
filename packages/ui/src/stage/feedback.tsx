"use client"

// Feedback from inside the game: a brass button in the top bar, a callout that points at it once per session, the
// panel it opens, and the rating row on an adventure's closing panel.

import { Star, X } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Button, buttonClassName } from "../button"
import { type FeedbackDraft, MAX_SCREENSHOTS, SCREENSHOT_TYPES, screenshotProblem } from "../feedback-rules"
import { FileInput, FileInputTrigger } from "../file-input"
import { Label } from "../label"
import { Presence, Swap } from "../presence"
import { Textarea } from "../textarea"
import { Tip } from "../tooltip"
import { cn, entrance, type MotionProps } from "../utils"
import { eyebrow, Pill, panel } from "./hud"

export type FeedbackStart = { kind: FeedbackDraft["kind"]; rating?: number }

const CALLOUT_SEEN = "d20-feedback-callout"
// The callout waits for the scene to settle, and lingers this long after the player's first click.
const CALLOUT_IN_MS = 1200
const CALLOUT_LINGER_MS = 2000

/** The feedback button, and on a session's first view of the game a callout under it. `visible` is whether the top bar shows. */
export function FeedbackButton({ active, visible, compact, onClick }: { active: boolean; visible: boolean; compact?: boolean; onClick: () => void }) {
  const [callout, setCallout] = useState(false)

  useEffect(() => {
    if (!visible) return
    try {
      if (sessionStorage.getItem(CALLOUT_SEEN)) return
    } catch {
      return
    }
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(CALLOUT_SEEN, "1")
      } catch {}
      setCallout(true)
    }, CALLOUT_IN_MS)
    return () => clearTimeout(timer)
  }, [visible])

  // A click anywhere sends the callout away after a moment. Its own close button and the feedback button do so at once.
  useEffect(() => {
    if (!callout) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const leave = () => {
      timer ??= setTimeout(() => setCallout(false), CALLOUT_LINGER_MS)
    }
    addEventListener("pointerdown", leave)
    return () => {
      removeEventListener("pointerdown", leave)
      clearTimeout(timer)
    }
  }, [callout])

  return (
    <div className="relative">
      <Tip label="Give Us Feedback">
        <Button
          variant="plain"
          type="button"
          aria-label="Give Us Feedback"
          aria-pressed={active}
          onClick={() => {
            setCallout(false)
            onClick()
          }}
          className="stage-stone grid h-10 w-10 place-items-center rounded-full border-0 transition-[filter,scale] duration-150 ease-snap active:scale-95"
        >
          <ThumbsUpDownSolid />
        </Button>
      </Tip>
      <Presence show={callout} motion="drop" asChild>
        <div className={cn(panel, "absolute right-0 z-overlay flex items-center gap-2 border-accent/60 py-2 pr-2 pl-4", compact ? "top-12" : "top-[52px]")}>
          {/* The pointer, under the middle of the button. */}
          <span aria-hidden="true" className="absolute -top-[7px] right-[14px] size-3 rotate-45 border-t border-l border-accent/60 bg-panel" />
          <span className="font-display text-sm tracking-wide whitespace-nowrap text-foreground">Give Us Feedback</span>
          <Button
            variant="plain"
            type="button"
            aria-label="Dismiss"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCallout(false)}
            className="grid size-6 place-items-center rounded-full text-foreground/60 transition-[color,background-color,scale] duration-150 ease-snap hover:bg-white/10 hover:text-foreground active:scale-90"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </Presence>
    </div>
  )
}

const NO_FILES: File[] = []

const field =
  "w-full resize-none rounded-hud border border-foreground/25 bg-black/40 px-3 py-2 font-serif text-sm leading-snug text-foreground transition-colors duration-150 placeholder:text-foreground/35 focus:border-accent/70 focus:outline-none"

function Stars({ value, onChange, size = "size-6" }: { value: number; onChange: (rating: number) => void; size?: string }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex justify-center gap-1" onPointerLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Button
          variant="plain"
          key={n}
          type="button"
          aria-label={`${n} of 5`}
          aria-pressed={value === n}
          onPointerEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className="p-0.5 transition-[scale] duration-150 ease-snap hover:scale-110 active:scale-95"
        >
          <Star className={cn(size, "transition-colors duration-150", n <= (hover || value) ? "fill-accent text-accent" : "text-foreground/40")} strokeWidth={1.5} />
        </Button>
      ))}
    </div>
  )
}

/** The rating row on an adventure's closing panel. A star opens the feedback panel with that rating. */
export function EndingRating({ sent, onRate }: { sent: boolean; onRate: (rating: number) => void }) {
  return (
    <div className="mt-5 border-t border-foreground/15 pt-4">
      <div className={eyebrow}>{sent ? "Thank You" : "How Was It?"}</div>
      <Swap id={sent ? "sent" : "ask"}>
        {sent ? <p className="mt-2 font-serif text-sm text-foreground/75">Your feedback was sent.</p> : <div className="mt-2">{<Stars value={0} onChange={onRate} />}</div>}
      </Swap>
    </div>
  )
}

/**
 * The feedback panel: a note, or an ending's rating and two answers, with screenshots. `onSend` resolves to an error,
 * or null. `gate` stands in for the form while the player cannot send, such as the app's step to link an account.
 */
export function FeedbackPanel({
  start,
  context,
  compact,
  gate,
  onSend,
  onSent,
  onClose,
  className,
  style,
  onAnimationEnd,
}: MotionProps & {
  start: FeedbackStart
  context: Record<string, string>
  compact?: boolean
  gate?: ReactNode
  onSend: (draft: FeedbackDraft) => Promise<string | null>
  onSent: (kind: FeedbackDraft["kind"]) => void
  onClose: () => void
}) {
  const ending = start.kind === "ending"
  const [message, setMessage] = useState("")
  const [rating, setRating] = useState(start.rating ?? 0)
  const [bestMoment, setBestMoment] = useState("")
  const [broke, setBroke] = useState("")
  const [shots, setShots] = useState<{ file: File; url: string }[]>([])
  const [state, setState] = useState<"writing" | "sending" | "sent">("writing")
  const [error, setError] = useState<string | null>(null)
  const shotsRef = useRef(shots)
  shotsRef.current = shots
  useEffect(
    () => () => {
      for (const shot of shotsRef.current) URL.revokeObjectURL(shot.url)
    },
    []
  )
  // The note takes the keyboard as the panel opens.
  const noteRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => noteRef.current?.focus(), [])

  const add = (files: readonly File[]) => {
    setError(null)
    const next = [...shots]
    for (const file of files) {
      const problem = next.length >= MAX_SCREENSHOTS ? `You can attach up to ${MAX_SCREENSHOTS} screenshots.` : screenshotProblem(file)
      if (problem) {
        setError(problem)
        break
      }
      next.push({ file, url: URL.createObjectURL(file) })
    }
    setShots(next)
  }
  const remove = (url: string) => {
    URL.revokeObjectURL(url)
    setShots(shots.filter((s) => s.url !== url))
  }

  const empty = !(message.trim() || bestMoment.trim() || broke.trim() || shots.length || (ending && rating))
  const send = async () => {
    setState("sending")
    setError(null)
    const failed = await onSend({
      kind: start.kind,
      message: message.trim(),
      ...(ending && rating ? { rating } : {}),
      ...(bestMoment.trim() ? { bestMoment: bestMoment.trim() } : {}),
      ...(broke.trim() ? { broke: broke.trim() } : {}),
      files: shots.map((s) => s.file),
      context,
    })
    if (failed) {
      setError(failed)
      setState("writing")
      return
    }
    setState("sent")
    onSent(start.kind)
  }
  // The thanks stays a moment, then the panel closes itself.
  useEffect(() => {
    if (state !== "sent") return
    const timer = setTimeout(onClose, 1800)
    return () => clearTimeout(timer)
  }, [state, onClose])

  return (
    <section
      aria-label="Feedback"
      className={cn(
        panel,
        "absolute z-panel flex max-h-[calc(100%-7rem)] w-[min(24rem,calc(100%-2rem))] flex-col overflow-y-auto p-6",
        compact ? "top-14 right-4 max-h-[calc(100%-4rem)]" : "top-24 right-10",
        entrance("enter-right", className)
      )}
      style={style}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={eyebrow}>Playtest</div>
          <h2 className="mt-1 font-serif text-2xl">{ending ? "How Was Your Adventure?" : "Give Us Feedback"}</h2>
        </div>
        <Button
          variant="plain"
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-full text-foreground/60 transition-[color,background-color,scale] duration-150 ease-snap hover:bg-white/10 hover:text-foreground active:scale-90"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* The gate, the form and the thanks take each other's place. */}
      <Swap id={gate ? "gate" : state === "sent" ? "sent" : "form"}>
        {gate ? (
          <div className="mt-4">{gate}</div>
        ) : state === "sent" ? (
          <p className="mt-6 mb-2 text-center font-display text-lg text-accent">Thank You</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3">
              {ending ? (
                <>
                  <Stars value={rating} onChange={setRating} size="size-7" />
                  <Label plain className="grid gap-1.5">
                    <span className={eyebrow}>Best Moment</span>
                    <Textarea plain rows={2} maxLength={4000} value={bestMoment} onChange={(e) => setBestMoment(e.target.value)} className={field} />
                  </Label>
                  <Label plain className="grid gap-1.5">
                    <span className={eyebrow}>What Broke</span>
                    <Textarea plain rows={2} maxLength={4000} value={broke} onChange={(e) => setBroke(e.target.value)} className={field} />
                  </Label>
                </>
              ) : (
                <Textarea
                  plain
                  rows={5}
                  maxLength={4000}
                  ref={noteRef}
                  aria-label="Your feedback"
                  placeholder="What worked? What broke?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={field}
                />
              )}

              {shots.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {shots.map((shot) => (
                    <li key={shot.url} className="enter-pop relative">
                      <img src={shot.url} alt={shot.file.name} className="h-16 w-24 rounded-hud border border-foreground/25 object-cover" />
                      <Button
                        variant="plain"
                        type="button"
                        aria-label={`Remove ${shot.file.name}`}
                        onClick={() => remove(shot.url)}
                        className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-foreground/40 bg-panel text-foreground transition-[border-color,scale] duration-150 ease-snap hover:border-accent active:scale-90"
                      >
                        <X className="size-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Presence show={Boolean(error)} motion="fade" asChild>
              <p role="alert" className="mt-3 font-serif text-sm text-red-300">
                {error}
              </p>
            </Presence>

            <div className="mt-4 flex items-center justify-between gap-2">
              {/* The panel keeps the screenshots, so the file input stays empty and hands each pick to add. */}
              <FileInput
                multiple
                accept={SCREENSHOT_TYPES}
                value={NO_FILES}
                onValueChange={(files) => add(files)}
                onReject={(rejected) => {
                  if (rejected[0]) setError(screenshotProblem(rejected[0].file))
                }}
                disabled={state === "sending" || shots.length >= MAX_SCREENSHOTS}
                className="flex"
              >
                <FileInputTrigger className={buttonClassName("outline", "xs")}>Add Screenshot</FileInputTrigger>
              </FileInput>
              <Pill variant="primary" disabled={empty || state === "sending"} onClick={() => void send()}>
                {state === "sending" ? "Sending…" : "Send"}
              </Pill>
            </div>
            <p className="mt-3 text-4xs leading-relaxed tracking-wide text-muted-foreground">Sent with the adventure, encounter and turn you are on.</p>
          </>
        )}
      </Swap>
    </section>
  )
}

/** Hugeicons' thumbs up/down outline, filled so the button reads quieter. */
function ThumbsUpDownSolid() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" aria-hidden="true">
      <path d="M7 6.5L10.0064 6.47879C10.8313 6.47879 11.5 7.15986 11.5 8C11.5 8.6125 11.4162 9.22201 11.251 9.81094L10.8595 11.5055C10.5283 12.6861 9.46888 13.5 8.26339 13.5H6.4C5.1888 13.5 3.9568 13.1294 3.17618 12.7318C2.7092 12.4939 2.5 11.9842 2.5 11.4601V8C2.5 7.38889 3.23934 6.3303 4.3 5.25C5.13094 4.40367 5.33855 3.65501 5.42085 3.10548C5.47346 2.75421 5.75113 2.5 6.1 2.5C6.7 2.5 7.6 3.16667 7.6 4.33333C7.6 5.5 7.3 5.88889 7 6.5Z" />
      <path d="M17 17.5L13.9936 17.5212C13.1687 17.5212 12.5 16.8401 12.5 16C12.5 15.3875 12.5838 14.778 12.749 14.1891L13.1405 12.4945C13.4717 11.3139 14.5311 10.5 15.7366 10.5H17.6C18.8112 10.5 20.0432 10.8706 20.8238 11.2682C21.2908 11.5061 21.5 12.0158 21.5 12.5399V16C21.5 16.6111 20.7607 17.6697 19.7 18.75C18.8691 19.5963 18.6615 20.345 18.5791 20.8945C18.5265 21.2458 18.2489 21.5 17.9 21.5C17.3 21.5 16.4 20.8333 16.4 19.6667C16.4 18.5 16.7 18.1111 17 17.5Z" />
    </svg>
  )
}
