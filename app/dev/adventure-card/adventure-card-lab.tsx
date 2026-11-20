"use client"

import { Trash2, X } from "lucide-react"
import type { ReactNode } from "react"
import { buttonClassName, buttonStyle } from "@d20/ui/button"
import { Chip, SectionPlate, siteLabel } from "@d20/ui/site"
import { cn } from "@/lib/utils"

// Sample save, shaped like the desktop app's SaveSummary plus what a richer card could ask for: the current scene's art,
// the party's portraits and the run's encounter trail. Those three are not in SaveSummary yet.
const S3 = "https://d20-public.s3.us-east-1.amazonaws.com/images"
const scene = (f: string) => `${S3}/settings/realm-of-myr/the-midnight-summons/${f}.png`

const save = {
  planId: "the-midnight-summons",
  title: "The Midnight Summons",
  round: 6,
  turnTitle: "The Missing Relics",
  party: [{ name: "Thalbern", role: "Ranger", image: `${S3}/characters/demo-ranger.png` }],
  players: "1 player",
  playedAt: "Nov 18",
  teaser: "A mysterious summons from an old druid friend draws a reclusive ranger into the wilds of the Valkarr forest.",
  cover: "/stage/covers/the-midnight-summons.jpg",
  sceneArt: scene("meeting-at-the-stones"),
  trail: [
    { title: "Broken Silence", image: scene("broken-silence-2") },
    { title: "Meeting at the Stones", image: scene("meeting-at-the-stones") },
    { title: "The Missing Relics", image: scene("meeting-at-the-stones") },
    { title: "The Owlbear Prowls", image: scene("owlbear-confrontation") },
    { title: "Owlbear Confrontation", image: scene("owlbear-confrontation") },
    { title: "Back Home", image: scene("back-home") },
  ],
  at: 2,
}

const others = [
  { title: "Covert Cargo", cover: "/stage/covers/covert-cargo.jpg", line: "Round 3 · The Shipment", party: "Thalbern, Mira, Dorn", chip: "Hosted", tone: "primary" as const, action: "Open", done: false, date: "Nov 12" },
  { title: "The Road to Kordavos", cover: "/stage/covers/the-road-to-kordavos.jpg", line: "Complete", party: "Aelar", chip: "Oct 30", tone: "dark" as const, action: "Read the Ending", done: true, date: "Oct 30" },
]

function Epic(props: { children: ReactNode; className?: string }) {
  return (
    <span className={buttonClassName("epic", undefined, cn("text-sm", props.className))} style={buttonStyle("epic")}>
      {props.children}
    </span>
  )
}

function Remove(props: { className?: string }) {
  return (
    <span className={cn("grid size-8 place-items-center rounded bg-red-950/60 text-red-400/80 hover:text-red-300", props.className)}>
      <Trash2 className="size-4" />
    </span>
  )
}

function Portrait(props: { src: string; className?: string }) {
  return <img src={props.src} alt="" className={cn("rounded-full object-cover object-top ring-2 ring-amber-400/70", props.className)} />
}

// A: the cover as a book on the left, the run laid out to its right.
function Ledger() {
  return (
    <div className="relative flex overflow-hidden rounded-lg border border-white/10 bg-black ring-8 ring-black/30">
      <img src={save.cover} alt="" className="aspect-[3/4] w-56 shrink-0 object-cover" />
      <div className="flex flex-1 flex-col gap-4 p-8">
        <div className="flex items-center gap-3">
          <Chip tone="amber">Playing</Chip>
          <span className={siteLabel}>{save.players} · Last played {save.playedAt}</span>
        </div>
        <h3 className="font-display text-4xl text-white">{save.title}</h3>
        <p className="max-w-2xl font-serif text-lg text-gray-300">{save.teaser}</p>
        <div className="mt-auto flex items-end justify-between gap-6">
          <div>
            <div className={siteLabel}>Round {save.round}</div>
            <div className="font-display text-2xl text-amber-300">{save.turnTitle}</div>
            <div className="mt-2 flex items-center gap-2 text-gray-300">
              <Portrait src={save.party[0].image} className="size-7" />
              {save.party.map((p) => p.name).join(", ")}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Remove />
            <Epic>Continue</Epic>
          </div>
        </div>
      </div>
    </div>
  )
}

// B: the scene the party stands in, as a wide film still, with the cover beside the title. Built into the app.
function Cinema() {
  return (
    <div className="relative aspect-[21/8] overflow-hidden rounded-lg border border-white/10 ring-8 ring-black/30">
      <img src={save.sceneArt} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
      <div className="relative flex h-full flex-col p-10">
        <div className="flex items-center gap-6">
          <img src={save.cover} alt="" className="aspect-[3/4] w-24 shrink-0 rounded-md object-cover shadow-[0_8px_24px_#000c] ring-1 ring-white/20" />
          <div className="flex flex-col items-start gap-3">
            <Chip tone="amber">Playing</Chip>
            <h3 className="max-w-xl font-display text-5xl leading-tight text-white [text-shadow:0_2px_12px_#000]">{save.title}</h3>
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between gap-6">
          <div>
            <div className={siteLabel}>Round {save.round}</div>
            <div className="font-display text-2xl text-amber-300 [text-shadow:0_2px_8px_#000]">{save.turnTitle}</div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="rounded-full bg-black/70 px-4 py-1.5 text-sm text-white">{save.party[0].name}</span>
            <Epic>Continue</Epic>
          </div>
        </div>
      </div>
      <span className="absolute top-6 right-6 grid size-8 place-items-center rounded-md bg-black/60 text-white/70">
        <X className="size-4" />
      </span>
    </div>
  )
}

// C: the encounter trail. Scenes behind are lit, the current one is large, the ones ahead stay veiled.
function Trail() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black ring-8 ring-black/30">
      <div className="flex items-center gap-6 px-8 pt-6 pb-4">
        <img src={save.cover} alt="" className="aspect-[3/4] w-14 rounded-sm object-cover" />
        <div className="flex-1">
          <h3 className="font-display text-2xl text-white">{save.title}</h3>
          <div className={siteLabel}>
            Round {save.round} · {save.party[0].name} · {save.playedAt}
          </div>
        </div>
        <Remove />
        <Epic>Continue</Epic>
      </div>
      <div className="flex items-stretch gap-2 px-8 pb-8">
        {save.trail.map((t, i) => {
          const now = i === save.at
          const ahead = i > save.at
          return (
            <div key={t.title} className={cn("relative overflow-hidden rounded", now ? "flex-[3] ring-2 ring-amber-400" : "flex-1")}>
              <img
                src={t.image}
                alt=""
                className={cn("h-40 w-full object-cover", ahead && "blur-sm grayscale brightness-[.35]", !now && !ahead && "brightness-75 saturate-50")}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-2 pt-8">
                <div className={cn("font-display leading-tight", now ? "text-lg text-amber-300" : "text-xs text-white/70")}>{ahead ? "?" : t.title}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// D: the hero leads. Their portrait breaks out of the card, the line reads like a recap.
function Hero() {
  return (
    <div className="relative mt-16 flex items-end rounded-lg border border-white/10 bg-gradient-to-r from-[#0d1a14] via-black to-black ring-8 ring-black/30">
      <img src={save.party[0].image} alt="" className="-mt-16 ml-6 h-80 w-64 shrink-0 object-cover object-top [mask-image:linear-gradient(to_bottom,black_75%,transparent)]" />
      <div className="flex flex-1 flex-col gap-3 p-8">
        <div className="flex items-center gap-3">
          <Chip tone="amber">Playing</Chip>
          <span className={siteLabel}>{save.title}</span>
        </div>
        <p className="font-display text-3xl leading-snug text-white">
          {save.party[0].name} the {save.party[0].role} is searching for <span className="text-amber-300">{save.turnTitle}</span>.
        </p>
        <p className="font-serif text-gray-400 italic">Round {save.round}. Last played {save.playedAt}.</p>
        <div className="mt-4 flex items-center gap-4">
          <Epic>Continue</Epic>
          <Remove />
        </div>
      </div>
      <img src={save.cover} alt="" className="m-8 hidden aspect-[3/4] w-40 rotate-3 rounded-sm object-cover shadow-[0_18px_40px_#000c] xl:block" />
    </div>
  )
}

// E: a book left open on the table. The cover tilts back, a ribbon marks the round, the facing page is the journal.
function Tome() {
  return (
    <div className="flex items-center gap-12 rounded-lg border border-white/10 bg-[radial-gradient(ellipse_at_left,#2a1d0e,#000_70%)] px-16 py-10 ring-8 ring-black/30 [perspective:1200px]">
      <div className="relative shrink-0 [transform:rotateY(18deg)] [transform-style:preserve-3d]">
        <img src={save.cover} alt="" className="aspect-[3/4] w-60 rounded-r-md object-cover shadow-[-12px_20px_40px_#000,inset_0_0_0_1px_#fff2]" />
        <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/70 to-transparent" />
        <div className="absolute -bottom-6 right-8 flex h-24 w-9 items-end justify-center bg-red-800 pb-3 font-display text-lg text-amber-100 shadow-lg [clip-path:polygon(0_0,100%_0,100%_100%,50%_85%,0_100%)]">
          {save.round}
        </div>
      </div>
      <div className="flex-1 border-l border-amber-200/10 pl-12">
        <div className={siteLabel}>Chapter {save.at + 1} of {save.trail.length}</div>
        <h3 className="mt-1 font-display text-3xl text-amber-200">{save.turnTitle}</h3>
        <p className="mt-4 max-w-xl font-serif text-lg leading-relaxed text-amber-50/80 first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-5xl first-letter:leading-none first-letter:text-amber-300">
          At midnight Thalbern reached the Old Standing Stones. Wollandora waited in the moonlight, and the relics she had guarded for a generation were gone.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Epic>Continue</Epic>
          <span className="font-serif text-sm text-white/50 italic">
            {save.party[0].name} · {save.playedAt}
          </span>
          <Remove className="ml-auto" />
        </div>
      </div>
    </div>
  )
}

// F: the title is the art. Huge type across the row over a dim, blurred cover, with a quiet strip of facts beneath.
function Marquee() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 ring-8 ring-black/30">
      <img src={save.cover} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover object-[50%_60%] blur-[2px] brightness-50" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/60" />
      <div className="relative px-10 pt-14 pb-6">
        <h3 className="font-display text-[clamp(3rem,7vw,6.5rem)] leading-[0.95] text-white [text-shadow:0_4px_24px_#000]">{save.title}</h3>
        <div className="mt-10 flex items-center gap-8 border-t border-white/20 pt-4 font-mono text-xs tracking-widest text-white/80 uppercase">
          <span className="text-amber-300">● Playing</span>
          <span>Round {save.round}</span>
          <span>{save.turnTitle}</span>
          <span>{save.party[0].name}</span>
          <span>{save.playedAt}</span>
          <span className="ml-auto flex items-center gap-4">
            <Remove />
            <Epic>Continue</Epic>
          </span>
        </div>
      </div>
    </div>
  )
}

// G: diptych. Cover on the left, where you are on the right, joined by a torn seam.
function Diptych() {
  return (
    <div className="relative grid grid-cols-[1fr_1.6fr] overflow-hidden rounded-lg border border-white/10 bg-black ring-8 ring-black/30">
      <img src={save.cover} alt="" className="h-96 w-full object-cover object-top" />
      <div className="relative">
        <img src={save.sceneArt} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
        <div className="absolute inset-y-0 -left-3 w-6 bg-black [mask-image:url('/images/app/art/texture-line.png')] [mask-size:auto_100%]" />
        <div className="absolute top-6 right-6 left-10 flex items-center justify-between">
          <span className={siteLabel}>You Are Here</span>
          <Remove />
        </div>
        <div className="absolute right-6 bottom-6 left-10 flex items-end justify-between gap-6">
          <div>
            <div className="font-mono text-xs text-white/70">ROUND {save.round}</div>
            <div className="font-display text-4xl text-amber-300 [text-shadow:0_2px_10px_#000]">{save.turnTitle}</div>
            <div className="mt-2 flex items-center gap-2 text-white/80">
              <Portrait src={save.party[0].image} className="size-7" />
              {save.party[0].name}
            </div>
          </div>
          <Epic>Continue</Epic>
        </div>
      </div>
    </div>
  )
}

// H: rows. Built for a long list: the current game gets a full row, older saves fold to slim lines.
function Rows() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black ring-8 ring-black/30">
      <div className="relative flex items-center gap-6 overflow-hidden p-5">
        <img src={save.sceneArt} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
        <img src={save.cover} alt="" className="relative aspect-[3/4] w-24 rounded-sm object-cover shadow-lg" />
        <div className="relative flex-1">
          <Chip tone="amber">Playing</Chip>
          <h3 className="mt-2 font-display text-3xl text-white">{save.title}</h3>
          <div className="text-amber-300">
            Round {save.round} · {save.turnTitle}
          </div>
        </div>
        <div className="relative flex items-center gap-4">
          <Portrait src={save.party[0].image} className="size-10" />
          <Remove />
          <Epic>Continue</Epic>
        </div>
      </div>
      {others.map((o) => (
        <div key={o.title} className="flex items-center gap-5 border-t border-white/10 px-5 py-3 hover:bg-white/5">
          <img src={o.cover} alt="" className={cn("aspect-[3/4] w-10 rounded-sm object-cover", o.done && "saturate-50 brightness-75")} />
          <div className="w-64 font-display text-lg text-white">{o.title}</div>
          <div className="flex-1 text-sm text-gray-400">{o.line}</div>
          <div className="w-48 text-sm text-gray-400">{o.party}</div>
          <Chip tone={o.tone}>{o.chip}</Chip>
          <span className="w-36 text-right font-display text-sm text-amber-300 hover:text-amber-200">{o.action} ›</span>
          <Remove />
        </div>
      ))}
    </div>
  )
}

const variants: { key: string; name: string; note: string; demo: ReactNode }[] = [
  { key: "a", name: "Ledger", note: "Cover left, run details right", demo: <Ledger /> },
  { key: "b", name: "Cinema", note: "Current scene as a wide still", demo: <Cinema /> },
  { key: "c", name: "Trail", note: "Encounter progress as a filmstrip", demo: <Trail /> },
  { key: "d", name: "Hero", note: "Portrait breaks out, recap line", demo: <Hero /> },
  { key: "e", name: "Tome", note: "Open book with a round ribbon", demo: <Tome /> },
  { key: "f", name: "Marquee", note: "Giant title over the cover", demo: <Marquee /> },
  { key: "g", name: "Diptych", note: "Cover beside the current scene", demo: <Diptych /> },
  { key: "h", name: "Rows", note: "Current game full, older saves slim", demo: <Rows /> },
]

export function AdventureCardLab() {
  return (
    <div className="min-h-screen bg-black px-8 pt-24 pb-32 text-white">
      <div className="mx-auto max-w-6xl space-y-20">
        <SectionPlate>Your Adventures</SectionPlate>
        {variants.map((v) => (
          <section key={v.key} id={v.key} className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-2xl text-amber-400">{v.key.toUpperCase()}</span>
              <span className="font-display text-xl text-white">{v.name}</span>
              <span className={siteLabel}>{v.note}</span>
            </div>
            {v.demo}
          </section>
        ))}
      </div>
    </div>
  )
}
