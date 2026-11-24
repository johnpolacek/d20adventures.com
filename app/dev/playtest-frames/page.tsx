// Dev-only lab for the playtest card's frame: several takes side by side over the realm painting, to pick one.
// Gated to development: notFound() elsewhere.

import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { Heading } from "@d20/ui/typography/heading"
import { isDev } from "@/lib/auth-utils"
import { served } from "@/lib/served"
import { REALM_ART } from "@/app/playtest/realm-art"
import "@/app/updates/updates.css"
import "./frames.css"

const gold = "bg-[linear-gradient(180deg,#fff7d6_0%,#fcd34d_38%,#b7791f_55%,#fde68a_72%,#a16207_100%)] bg-clip-text text-transparent drop-shadow-[0_2px_6px_#f59e0b55]"

const takes: { id: string; name: string; note: string }[] = [
  { id: "now", name: "A. Now", note: "The card as it ships: a faint gold hairline and a rounded corner." },
  { id: "double", name: "B. Double Rule", note: "Two gold rules with dark between, like a bound ledger's border." },
  { id: "corners", name: "C. Corner Pieces", note: "Plain edge, with gilt corner pieces and a diamond at each." },
  { id: "gilt", name: "D. Gilt Frame", note: "A thick bevelled gold frame, lit from the top, like a painting's." },
  { id: "iron", name: "E. Iron Bound", note: "Dark iron bands with studs at the corners. Heavier, more dungeon." },
  { id: "notch", name: "F. Cut Corners", note: "Chamfered corners with a gold edge, closer to the stage HUD." },
  { id: "rune", name: "G. Living Edge", note: "A slow ember of light travels the hairline. Motion, so use lightly." },
  { id: "banner", name: "H. Title Plate", note: "Double rule, with the title on a plate that breaks the top edge." },
]

function Corner() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="fx-corner">
      <path d="M3 46 V12 Q3 3 12 3 H46" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M10 40 V16 Q10 10 16 10 H40" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.7" />
      <path d="M46 3 q -4 6 -10 6 M3 46 q 6 -4 6 -10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M17 17 l6 -6 l6 6 l-6 6 z" fill="currentColor" />
      <circle cx="17" cy="17" r="1.6" fill="#120e0a" transform="translate(6 0)" />
    </svg>
  )
}

function Paper() {
  return <div aria-hidden data-up-theme="dark" className="up-surface fx-paper" />
}

function Body({ title }: { title?: boolean }) {
  return (
    <>
      {title !== false && (
        <Heading variant="h1" className={gold}>
          You’re a Playtester
        </Heading>
      )}
      <p className="mt-3 font-serif text-base leading-relaxed text-white/80">Run a tabletop adventure with an AI Game Master. Host it on your computer, and your friends join from the web.</p>
      <Heading variant="h3" as="h2" className="mt-6">
        Host a Game
      </Heading>
      <div className="mt-3 h-16 rounded border border-white/10 bg-black/40" />
      <div className="mt-6 text-center">
        <Button variant="epic">Play the Solo Demo</Button>
      </div>
    </>
  )
}

function Take({ id }: { id: string }): ReactNode {
  if (id === "corners")
    return (
      <article className="fx-card fx-corners">
        <Paper />
        <Corner />
        <Corner />
        <Corner />
        <Corner />
        <div className="fx-inner">
          <Body />
        </div>
      </article>
    )
  if (id === "iron")
    return (
      <article className="fx-card fx-iron">
        <Paper />
        <i className="fx-stud" />
        <i className="fx-stud" />
        <i className="fx-stud" />
        <i className="fx-stud" />
        <div className="fx-inner">
          <Body />
        </div>
      </article>
    )
  if (id === "banner")
    return (
      <article className="fx-card fx-double fx-banner">
        <Paper />
        <div className="fx-plate">
          <Heading variant="h2" as="h1" className={gold}>
            You’re a Playtester
          </Heading>
        </div>
        <div className="fx-inner">
          <Body title={false} />
        </div>
      </article>
    )
  return (
    <article className={`fx-card fx-${id}`}>
      <Paper />
      <div className="fx-inner">
        <Body />
      </div>
    </article>
  )
}

export default function PlaytestFramesPage() {
  if (!isDev()) notFound()
  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-black">
        <Image fill priority src={served(REALM_ART)} alt="" className="object-cover" />
      </div>
      <div className="container pt-28 pb-24">
        <div className="mx-auto mb-10 max-w-3xl rounded bg-black/70 px-5 py-3 font-sans text-sm text-white/80">Frames for the playtest card. Each take is the same card with a different edge.</div>
        <div className="grid gap-x-10 gap-y-16 lg:grid-cols-2">
          {takes.map((t) => (
            <section key={t.id}>
              <div className="mb-4 rounded bg-black/70 px-4 py-2 font-sans text-sm">
                <div className="font-bold text-accent-200">{t.name}</div>
                <div className="text-white/75">{t.note}</div>
              </div>
              <Take id={t.id} />
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
