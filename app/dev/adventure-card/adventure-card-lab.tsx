"use client"

import { X } from "lucide-react"
import type { ReactNode } from "react"
import { buttonClassName, buttonStyle } from "@d20/ui/button"
import { Chip, SectionPlate, siteLabel, siteOutline } from "@d20/ui/site"
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
    <span className={cn("grid size-8 place-items-center rounded-md bg-black/60 text-white/70 hover:bg-red-600/80 hover:text-white", props.className)}>
      <X className="size-4" />
    </span>
  )
}

function Thumb(props: { className?: string }) {
  return <img src={save.cover} alt="" className={cn("aspect-[3/4] w-20 shrink-0 rounded-md object-cover shadow-raised ring-1 ring-white/20", props.className)} />
}

function Portrait(props: { src: string; className?: string }) {
  return <img src={props.src} alt="" className={cn("rounded-full object-cover object-top ring-2 ring-accent-400/70", props.className)} />
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
        <p className="max-w-2xl font-serif text-lg text-zinc-300">{save.teaser}</p>
        <div className="mt-auto flex items-end justify-between gap-6">
          <div>
            <div className={siteLabel}>Round {save.round}</div>
            <div className="font-display text-2xl text-accent-300">{save.turnTitle}</div>
            <div className="mt-2 flex items-center gap-2 text-zinc-300">
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
          <img src={save.cover} alt="" className="aspect-[3/4] w-24 shrink-0 rounded-md object-cover shadow-raised ring-1 ring-white/20" />
          <div className="flex flex-col items-start gap-3">
            <Chip tone="amber">Playing</Chip>
            <h3 className="max-w-xl font-display text-5xl leading-tight text-white [text-shadow:0_2px_12px_#000]">{save.title}</h3>
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between gap-6">
          <div>
            <div className={siteLabel}>Round {save.round}</div>
            <div className="font-display text-2xl text-accent-300 [text-shadow:0_2px_8px_#000]">{save.turnTitle}</div>
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
            <div key={t.title} className={cn("relative overflow-hidden rounded", now ? "flex-[3] ring-2 ring-accent-400" : "flex-1")}>
              <img
                src={t.image}
                alt=""
                className={cn("h-40 w-full object-cover", ahead && "blur-sm grayscale brightness-[.35]", !now && !ahead && "brightness-75 saturate-50")}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-2 pt-8">
                <div className={cn("font-display leading-tight", now ? "text-lg text-accent-300" : "text-xs text-white/70")}>{ahead ? "?" : t.title}</div>
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
          {save.party[0].name} the {save.party[0].role} is searching for <span className="text-accent-300">{save.turnTitle}</span>.
        </p>
        <p className="font-serif text-zinc-400 italic">Round {save.round}. Last played {save.playedAt}.</p>
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
        <div className="absolute -bottom-6 right-8 flex h-24 w-9 items-end justify-center bg-red-800 pb-3 font-display text-lg text-accent-100 shadow-lg [clip-path:polygon(0_0,100%_0,100%_100%,50%_85%,0_100%)]">
          {save.round}
        </div>
      </div>
      <div className="flex-1 border-l border-accent-200/10 pl-12">
        <div className={siteLabel}>Chapter {save.at + 1} of {save.trail.length}</div>
        <h3 className="mt-1 font-display text-3xl text-accent-200">{save.turnTitle}</h3>
        <p className="mt-4 max-w-xl font-serif text-lg leading-relaxed text-accent-50/80 first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-5xl first-letter:leading-none first-letter:text-accent-300">
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
          <span className="text-accent-300">● Playing</span>
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
            <div className="font-display text-4xl text-accent-300 [text-shadow:0_2px_10px_#000]">{save.turnTitle}</div>
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
          <div className="text-accent-300">
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
          <div className="flex-1 text-sm text-zinc-400">{o.line}</div>
          <div className="w-48 text-sm text-zinc-400">{o.party}</div>
          <Chip tone={o.tone}>{o.chip}</Chip>
          <span className="w-36 text-right font-display text-sm text-accent-300 hover:text-accent-200">{o.action} ›</span>
          <Remove />
        </div>
      ))}
    </div>
  )
}

// I: sidebar. The scene runs edge to edge, and a solid panel on the right holds everything you read.
function Sidebar() {
  return (
    <div className="relative grid aspect-[21/8] grid-cols-[1fr_22rem] overflow-hidden rounded-lg border border-white/10 ring-8 ring-black/30">
      <img src={save.sceneArt} alt="" className="h-full w-full object-cover" />
      <div className="relative flex flex-col gap-4 bg-[#07090c] p-8 shadow-[-30px_0_60px_#000]">
        <div className="flex items-start justify-between">
          <Thumb className="w-16" />
          <Remove />
        </div>
        <h3 className="font-display text-3xl leading-tight text-white">{save.title}</h3>
        <div className="h-px bg-gradient-to-r from-accent-400/60 to-transparent" />
        <div>
          <div className={siteLabel}>Round {save.round}</div>
          <div className="font-display text-xl text-accent-300">{save.turnTitle}</div>
        </div>
        <div className="mt-auto flex items-center justify-between">
          <span className="font-serif text-sm text-white/60 italic">{save.party[0].name}</span>
          <Epic>Continue</Epic>
        </div>
      </div>
    </div>
  )
}

// J: a chapter title card, centred like the frame before a film's next act.
function TitleCard() {
  return (
    <div className="relative grid aspect-[21/8] place-items-center overflow-hidden rounded-lg border border-white/10 ring-8 ring-black/30">
      <img src={save.sceneArt} alt="" className="absolute inset-0 h-full w-full object-cover brightness-[.45]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#000_85%)]" />
      <Remove className="absolute top-6 right-6" />
      <div className="relative flex flex-col items-center text-center">
        <Thumb className="w-14" />
        <div className="mt-5 font-display text-sm tracking-[0.4em] text-white/70 uppercase">{save.title}</div>
        <div className="my-3 flex items-center gap-4 text-accent-400/80">
          <span className="h-px w-24 bg-gradient-to-l from-accent-400/70 to-transparent" />◆<span className="h-px w-24 bg-gradient-to-r from-accent-400/70 to-transparent" />
        </div>
        <h3 className="font-display text-6xl text-accent-200 [text-shadow:0_2px_16px_#000]">{save.turnTitle}</h3>
        <div className="mt-3 font-serif text-white/60 italic">
          Round {save.round} · {save.party[0].name}
        </div>
        <Epic className="mt-6">Continue</Epic>
      </div>
    </div>
  )
}

// K: Cinema with the run's length along its foot, one segment per scene.
function ProgressBanner() {
  return (
    <div className="relative aspect-[21/8] overflow-hidden rounded-lg border border-white/10 ring-8 ring-black/30">
      <img src={save.sceneArt} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
      <Remove className="absolute top-6 right-6" />
      <div className="absolute inset-x-10 bottom-8">
        <div className="flex items-end gap-5">
          <Thumb />
          <div className="flex-1">
            <h3 className="font-display text-4xl text-white [text-shadow:0_2px_12px_#000]">{save.title}</h3>
            <div className="font-display text-xl text-accent-300">
              Round {save.round} · {save.turnTitle}
            </div>
          </div>
          <Epic>Continue</Epic>
        </div>
        <div className="mt-5 flex gap-1.5">
          {save.trail.map((t, i) => (
            <div key={t.title} className="flex-1">
              <div className={cn("h-1.5 rounded-full", i < save.at ? "bg-accent-400/70" : i === save.at ? "bg-accent-300 shadow-[0_0_10px_#fbbf24]" : "bg-white/15")} />
              <div className={cn("mt-1.5 truncate font-mono text-xxs uppercase", i === save.at ? "text-accent-200" : i < save.at ? "text-white/50" : "text-white/20")}>{i > save.at ? "?" : t.title}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// L: a painting on a gallery wall, gilt frame and a brass nameplate beneath.
function Gallery() {
  return (
    <div className="flex items-center gap-10 rounded-lg border border-white/10 bg-[radial-gradient(ellipse_at_top,#1d1712,#050403_70%)] p-10 ring-8 ring-black/30">
      <div className="flex-1">
        <div className="rounded-sm bg-gradient-to-br from-[#8a6a2c] via-[#d6b25e] to-[#5c4318] p-2.5 shadow-[0_24px_50px_#000]">
          <div className="border-4 border-[#2a1e0c] shadow-[inset_0_0_30px_#000]">
            <img src={save.sceneArt} alt="" className="aspect-[2/1] w-full object-cover" />
          </div>
        </div>
        <div className="mx-auto -mt-1 w-fit rounded-b bg-gradient-to-b from-[#c9a24f] to-[#7d5c22] px-6 py-1.5 font-display text-sm text-[#1c1408] shadow-lg">
          {save.turnTitle} · Round {save.round}
        </div>
      </div>
      <div className="flex w-72 flex-col gap-4">
        <div className="flex items-start justify-between">
          <Thumb />
          <Remove />
        </div>
        <h3 className="font-display text-3xl text-white">{save.title}</h3>
        <p className="font-serif text-sm text-white/60 italic">{save.party[0].name} · {save.playedAt}</p>
        <Epic className="self-start">Continue</Epic>
      </div>
    </div>
  )
}

// M: a deck. The current game on top, the other saves fanned behind it, so one card says how many runs there are.
function Deck() {
  return (
    <div className="relative pt-6 pr-6">
      {others.map((o, i) => (
        <img
          key={o.title}
          src={o.cover}
          alt=""
          className="absolute aspect-[21/8] w-full rounded-lg object-cover brightness-[.3] ring-1 ring-white/10"
          style={{ top: `${(1 - i) * 12}px`, left: `${(i + 1) * 12}px`, transform: `rotate(${(i + 1) * 0.6}deg)` }}
        />
      ))}
      <div className="relative aspect-[21/8] overflow-hidden rounded-lg border border-white/10 ring-8 ring-black/40">
        <img src={save.sceneArt} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
        <Remove className="absolute top-6 right-6" />
        <div className="relative flex h-full items-center gap-6 p-10">
          <Thumb className="w-28" />
          <div>
            <Chip tone="amber">Playing</Chip>
            <h3 className="mt-3 font-display text-5xl text-white">{save.title}</h3>
            <div className="mt-2 font-display text-xl text-accent-300">
              Round {save.round} · {save.turnTitle}
            </div>
            <Epic className="mt-6">Continue</Epic>
          </div>
        </div>
        <div className="absolute right-8 bottom-6 font-mono text-xs text-white/60">+{others.length} more saves</div>
      </div>
    </div>
  )
}

// N: the pause screen. As if the game were frozen mid-scene, with the party's HUD still up.
function Pause() {
  return (
    <div className="relative aspect-[21/8] overflow-hidden rounded-lg border border-white/10 ring-8 ring-black/30">
      <img src={save.sceneArt} alt="" className="absolute inset-0 h-full w-full object-cover saturate-[.7]" />
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-black/90 to-transparent px-8 pt-6 pb-10">
        <Thumb className="w-10 rounded" />
        <span className="font-display text-xl text-white">{save.title}</span>
        <span className="font-mono text-xs text-white/50">ROUND {save.round}</span>
        <Remove className="ml-auto" />
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="font-display text-sm tracking-[0.5em] text-white/70">PAUSED</div>
          <Epic className="scale-125">Continue</Epic>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/90 to-transparent px-8 pt-10 pb-6">
        <div className="flex items-center gap-3">
          <Portrait src={save.party[0].image} className="size-14" />
          <div>
            <div className="font-display text-lg text-white">{save.party[0].name}</div>
            <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-[72%] bg-emerald-500" />
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={siteLabel}>Scene</div>
          <div className="font-display text-xl text-accent-300">{save.turnTitle}</div>
        </div>
      </div>
    </div>
  )
}

// O: triptych. The two scenes behind you and the one you stand in, so the card reads as a story so far.
function Triptych() {
  const shown = save.trail.slice(save.at - 2, save.at + 1)
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black ring-8 ring-black/30">
      <div className="grid h-72 grid-cols-[1fr_1fr_2.4fr] gap-1">
        {shown.map((t, i) => (
          <div key={t.title} className="relative overflow-hidden">
            <img src={t.image} alt="" className={cn("h-full w-full object-cover", i < 2 && "brightness-50 saturate-50")} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-3 pt-10">
              <div className={cn("font-display", i === 2 ? "text-2xl text-accent-300" : "text-sm text-white/60")}>{t.title}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-5 px-6 py-4">
        <Thumb className="w-12" />
        <div className="flex-1">
          <h3 className="font-display text-2xl text-white">{save.title}</h3>
          <div className={siteLabel}>
            Round {save.round} · {save.party[0].name}
          </div>
        </div>
        <Remove />
        <Epic>Continue</Epic>
      </div>
    </div>
  )
}

// P: letterbox. Cinemascope bars above and below the still carry the type, the picture stays clean.
function Letterbox() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black ring-8 ring-black/30">
      <div className="flex items-center gap-4 px-8 py-4">
        <Thumb className="w-10 rounded" />
        <h3 className="flex-1 font-display text-2xl tracking-wide text-white">{save.title}</h3>
        <Remove />
      </div>
      <img src={save.sceneArt} alt="" className="aspect-[3/1] w-full object-cover" />
      <div className="flex items-center gap-6 px-8 py-4">
        <span className="font-mono text-xs text-white/50">ROUND {save.round}</span>
        <span className="flex-1 font-display text-xl text-accent-300">{save.turnTitle}</span>
        <span className="font-serif text-sm text-white/60 italic">{save.party[0].name}</span>
        <Epic>Continue</Epic>
      </div>
    </div>
  )
}

// Q: Deck's layout without the deck. The cover, title and button sit up top left, the button's foot level with the
// cover's, and the party stands bottom left as on the pause screen. Each save is its own card.
type Run = {
  title: string
  cover: string
  art: string
  kicker: string
  status: string
  action: string
  done?: boolean
  party: { name: string; portrait: string; hp: number }[]
}
const fx = (adventure: string, name: string) => `/stage/fixtures/${adventure}/${name}-portrait.jpg`
const runs: Run[] = [
  {
    title: save.title,
    cover: save.cover,
    art: save.sceneArt,
    kicker: `Round ${save.round}`,
    status: save.turnTitle,
    action: "Continue",
    party: [{ name: "Thalbern", portrait: fx("the-midnight-summons", "thalbern"), hp: 0.72 }],
  },
  {
    title: "Covert Cargo",
    cover: "/stage/covers/covert-cargo.jpg",
    art: "/stage/art/covert-cargo/the-shipment.webp",
    kicker: "Hosted · Round 3",
    status: "The Shipment",
    action: "Open",
    party: [
      { name: "Lyra", portrait: fx("covert-cargo", "lyra"), hp: 1 },
      { name: "Poppen", portrait: fx("covert-cargo", "poppen"), hp: 0.55 },
      { name: "Reinhard", portrait: fx("covert-cargo", "reinhard"), hp: 0.9 },
    ],
  },
  {
    title: "The Road to Kordavos",
    cover: "/stage/covers/the-road-to-kordavos.jpg",
    art: "/stage/art/the-road-to-kordavos/the-fortune-teller.webp",
    kicker: "Oct 30",
    status: "Complete",
    action: "Read the Ending",
    done: true,
    party: [{ name: "Aelar", portrait: fx("covert-cargo", "aelar"), hp: 1 }],
  },
]

// The card asking before it removes a save, as the app shows it after the X.
function Confirming({ title }: { title: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center rounded-lg bg-black/75 backdrop-blur-sm">
      <div className="flex flex-col items-center text-center">
        <h3 className="font-display text-3xl text-white">Archive {title}?</h3>
        <div className="mt-6 flex items-center gap-4">
          <span className={cn(siteOutline, "px-6 py-2 font-display text-sm")}>Cancel</span>
          <Epic>Archive</Epic>
        </div>
        <span className="mt-5 rounded-md px-3 py-1 font-display text-xs text-red-300/70">Delete Permanently</span>
      </div>
    </div>
  )
}

function RunCard({ run, confirming }: { run: Run; confirming?: boolean }) {
  return (
    <div className="relative aspect-[21/8] overflow-hidden rounded-lg border border-white/10 ring-8 ring-black/30">
      <img src={run.art} alt="" className={cn("absolute inset-0 h-full w-full object-cover", run.done && "saturate-50 brightness-75")} />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
      <Remove className="absolute top-6 right-6" />
      <div className="absolute top-8 left-8 flex items-stretch gap-6">
        <img src={run.cover} alt="" className="aspect-[3/4] w-28 shrink-0 rounded-md object-cover shadow-raised ring-1 ring-white/20" />
        <div className="flex flex-col items-start">
          <h3 className="font-display text-4xl leading-tight text-white [text-shadow:0_2px_12px_#000]">{run.title}</h3>
          <div className={cn(siteLabel, "mt-1")}>{run.kicker}</div>
          <div className="font-display text-xl text-accent-300 [text-shadow:0_2px_8px_#000]">{run.status}</div>
          <Epic className="mt-auto">{run.action}</Epic>
        </div>
      </div>
      <div className="absolute bottom-6 left-8 flex items-end gap-6">
        {run.party.map((h) => (
          <div key={h.name} className="flex items-center gap-3">
            <Portrait src={h.portrait} className="size-14" />
            <div>
              <div className="font-display text-lg text-white [text-shadow:0_2px_8px_#000]">{h.name}</div>
              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-white/15">
                <div className="h-full bg-emerald-500" style={{ width: `${h.hp * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {confirming && <Confirming title={run.title} />}
    </div>
  )
}

function Saves() {
  return (
    <div className="flex flex-col gap-8">
      {runs.map((r, i) => (
        <RunCard key={r.title} run={r} confirming={i === 2} />
      ))}
    </div>
  )
}

const variants: { key: string; name: string; note: string; demo: ReactNode }[] = [
  { key: "q", name: "Saves", note: "Deck layout, party bottom left, one card per save", demo: <Saves /> },
  { key: "a", name: "Ledger", note: "Cover left, run details right", demo: <Ledger /> },
  { key: "b", name: "Cinema", note: "Current scene as a wide still", demo: <Cinema /> },
  { key: "c", name: "Trail", note: "Encounter progress as a filmstrip", demo: <Trail /> },
  { key: "d", name: "Hero", note: "Portrait breaks out, recap line", demo: <Hero /> },
  { key: "e", name: "Tome", note: "Open book with a round ribbon", demo: <Tome /> },
  { key: "f", name: "Marquee", note: "Giant title over the cover", demo: <Marquee /> },
  { key: "g", name: "Diptych", note: "Cover beside the current scene", demo: <Diptych /> },
  { key: "h", name: "Rows", note: "Current game full, older saves slim", demo: <Rows /> },
  { key: "i", name: "Sidebar", note: "Clean scene, solid text panel right", demo: <Sidebar /> },
  { key: "j", name: "Title Card", note: "Centred chapter card", demo: <TitleCard /> },
  { key: "k", name: "Progress Banner", note: "Scene still with a segmented progress bar", demo: <ProgressBanner /> },
  { key: "l", name: "Gallery", note: "Framed painting with a nameplate", demo: <Gallery /> },
  { key: "m", name: "Deck", note: "Other saves fanned behind", demo: <Deck /> },
  { key: "n", name: "Pause", note: "The game frozen mid-scene, HUD up", demo: <Pause /> },
  { key: "o", name: "Triptych", note: "The last two scenes and this one", demo: <Triptych /> },
  { key: "p", name: "Letterbox", note: "Type in the bars, the picture clean", demo: <Letterbox /> },
]

export function AdventureCardLab() {
  return (
    <div className="min-h-screen bg-black px-8 pt-24 pb-32 text-white">
      <div className="mx-auto max-w-6xl space-y-20">
        <SectionPlate>Your Adventures</SectionPlate>
        {variants.map((v) => (
          <section key={v.key} id={v.key} className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-2xl text-accent-400">{v.key.toUpperCase()}</span>
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
