"use client"

import { Button } from "@d20/ui/button"
import { gsap, prefersReducedMotion, useGSAP } from "@d20/ui/motion"
import { Heading } from "@d20/ui/typography/heading"
import Link from "next/link"
import { useId, useRef, useState } from "react"
import { CopyBlock } from "@/components/copy-block"
import { DEMO_LIMIT_MESSAGE } from "@/lib/demo-limit"
import { cn } from "@/lib/utils"

// The body of an adventure's page, in two views that share one place: what the adventure is, and how to host it. The
// Host button swaps them. The view leaving slides off to one side as the other comes in from the opposite side, and
// the place takes the height of what it now holds, so the footer follows. A second press mid-swap turns it around
// from where it stands.

type View = "about" | "host"

const DISTANCE = 36
const DURATION = 0.4
// A view that is not shown takes no room and cannot be reached by keyboard or reader.
const AWAY = "invisible absolute inset-x-0 top-0 h-0 overflow-hidden"

export function AdventureDetails({
  settingId,
  planId,
  title,
  teaser,
  overview,
  video,
  prompt,
  demo,
  spent,
}: {
  settingId: string
  planId: string
  title: string
  teaser?: string
  overview?: string
  /** The YouTube id of a gameplay video. */
  video?: string
  /** What a new host pastes into an AI coding agent. */
  prompt: string
  /** Given when this adventure is not played in a browser: the adventure that is, if the setting has one. */
  demo?: { id: string; title: string } | null
  /** The site's AI budget for today is spent, so no new game starts in a browser. */
  spent?: boolean
}) {
  const hosted = demo !== undefined
  const [view, setView] = useState<View>("about")
  const frame = useRef<HTMLDivElement>(null)
  const about = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLElement>(null)
  const hostButton = useRef<HTMLSpanElement>(null)
  // The frame's height as the swap began, measured before React moves the views.
  const before = useRef(0)
  const settled = useRef(true)
  // The swap under way. Killing it, not its tweens, stops it without its end firing.
  const running = useRef<gsap.core.Timeline | null>(null)
  const hostId = useId()
  const headingId = useId()

  const swap = () => {
    before.current = frame.current?.offsetHeight ?? 0
    settled.current = false
    setView((v) => (v === "host" ? "about" : "host"))
  }

  useGSAP(
    () => {
      if (settled.current) return
      const box = frame.current
      const incoming = view === "host" ? host.current : about.current
      const outgoing = view === "host" ? about.current : host.current
      if (!box || !incoming || !outgoing) return
      const direction = view === "host" ? 1 : -1
      const all = [box, incoming, outgoing]
      const rest = () => {
        gsap.set(all, { clearProps: "transform,opacity,visibility,height,overflow" })
        settled.current = true
        running.current = null
      }
      // The reader is taken to what the press brought: the host view, or back to the button that leaves it.
      if (view === "host") incoming.focus({ preventScroll: true })
      else hostButton.current?.querySelector("button")?.focus({ preventScroll: true })

      // A press mid-swap: each view goes on from where it stands, not from the start.
      const turning = running.current !== null
      running.current?.kill()
      if (prefersReducedMotion()) return rest()
      if (!turning) {
        gsap.set(incoming, { x: direction * DISTANCE, opacity: 0 })
        gsap.set(outgoing, { x: 0, opacity: 1 })
      }
      // The view leaving is out of the flow and hidden now, so it is given back its height and shown while it goes.
      // Opacity, not visibility, hides the one arriving: a hidden element cannot keep the focus it was just given.
      gsap.set(outgoing, { height: "auto", overflow: "visible", visibility: "visible" })
      running.current = gsap
        .timeline({ defaults: { overwrite: true }, onComplete: rest })
        .fromTo(box, { height: before.current }, { height: incoming.offsetHeight, duration: DURATION, ease: "power2.inOut" }, 0)
        .to(outgoing, { x: -direction * DISTANCE, opacity: 0, duration: DURATION * 0.5, ease: "power2.in" }, 0)
        // The view arriving waits until the other has mostly gone, so the two texts never overlap to read.
        .to(incoming, { x: 0, opacity: 1, duration: DURATION, ease: "back.out(1.4)" }, turning ? 0 : DURATION * 0.45)
    },
    { dependencies: [view] }
  )

  return (
    <>
      <div className="my-8 flex flex-wrap justify-center gap-4">
        {!hosted && !spent && (
          <Link href={`/settings/${settingId}/${planId}/character-select`}>
            <Button variant="epic">Play</Button>
          </Link>
        )}
        <span ref={hostButton}>
          <Button variant="epic" className="bg-violet-700 text-white" aria-expanded={view === "host"} aria-controls={hostId} onClick={swap}>
            Host
          </Button>
        </span>
      </div>

      <div ref={frame} className="relative">
        <div ref={about} inert={view !== "about"} className={cn(view === "about" ? "relative" : AWAY)}>
          {!hosted && spent && <p className="-mt-2 mb-8 text-center text-sm text-zinc-400">{DEMO_LIMIT_MESSAGE}</p>}
          {hosted && (
            <p className="-mt-2 mb-8 text-center text-sm text-zinc-400">
              One player hosts this adventure in the desktop app, and friends join in a browser.
              {demo && (
                <>
                  {" "}
                  To play in a browser now, try{" "}
                  <Link href={`/settings/${settingId}/${demo.id}`} className="text-accent-300 underline underline-offset-2 transition-colors duration-150 hover:text-accent-200">
                    {demo.title}
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          <p className="text-lg text-zinc-200">{teaser || overview}</p>
          {teaser && overview && overview !== teaser && <p className="mt-4 whitespace-pre-line text-zinc-300">{overview}</p>}

          {video && (
            <section>
              <Heading variant="h3" className="mt-14 mb-4">
                Gameplay
              </Heading>
              <div className="aspect-video overflow-hidden rounded-lg border border-accent-200/20 bg-black">
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${video}`}
                  title={`${title} Gameplay`}
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </section>
          )}
        </div>

        <section ref={host} id={hostId} aria-labelledby={headingId} tabIndex={-1} inert={view !== "host"} className={cn("outline-none", view === "host" ? "relative" : AWAY)}>
          <Heading variant="h3" as="h2" id={headingId}>
            Host This Adventure
          </Heading>
          <p className="mt-3 text-lg text-zinc-200">You run the game on your computer in the desktop app, and your friends join from the web.</p>
          <p className="mt-3 text-zinc-300">Paste this prompt into an AI coding agent, such as Claude Code or Codex. It installs the app and helps you start {title}.</p>
          <CopyBlock label="Prompt" text={prompt} className="mt-6" />
          <div className="mt-6 flex justify-center">
            <Button variant="ghost" onClick={swap}>
              Back
            </Button>
          </div>
        </section>
      </div>
    </>
  )
}
