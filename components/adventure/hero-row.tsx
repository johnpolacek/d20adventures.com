import { Plus, ScrollText } from "lucide-react"
import Link from "next/link"
import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties, ReactElement, ReactNode } from "react"
import { Button, buttonClassName } from "@d20/ui/button"
import { prefersReducedMotion } from "@d20/ui/motion"
import Image from "@d20/ui/native-image"
import { pictureAt } from "@/lib/images"
import { cn } from "@/lib/utils"
import type { PC, PCTemplate } from "@/types/character"

// First sentence / paragraph of a hero's personality or background for the portrait card.
function heroFlavor(c: PC | PCTemplate): string | null {
  const source = c.personality?.trim() || c.background?.trim()
  if (!source) return null
  const firstLine = source.split(/\n+/)[0]?.trim()
  return firstLine || null
}

// A seated hero (or compact companion) in a lobby list: portrait, name and class in one clean row.
// Clicking the hero opens their character sheet. A tag says who plays a seated hero.
export function HeroRow(props: {
  character: PC | PCTemplate
  onOpen?: () => void
  tag?: ReactNode
  action?: { label: string; onClick: () => void; disabled?: boolean; variant?: "primary" | "outline" }
  mine?: boolean
  className?: string
  style?: CSSProperties
}) {
  const c = props.character
  return (
    <li
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-xl border p-2.5 transition-[border-color,background-color] duration-150",
        props.mine
          ? "border-accent-300/45 bg-accent-300/[0.06] hover:border-accent-300/65"
          : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]",
        props.className
      )}
      style={props.style}
    >
      <Button
        variant="plain"
        type="button"
        onClick={props.onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity duration-100 active:opacity-75"
      >
        <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/50 transition-colors group-hover:border-accent-300/35">
          {c.image && (
            <Image
              src={pictureAt(c.image, 96)}
              alt=""
              fill
              className="object-cover object-[50%_15%]"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-display text-base leading-snug transition-colors",
              props.mine ? "text-accent-300" : "text-white group-hover:text-accent-200"
            )}
          >
            {c.name}
          </span>
          <span className="block truncate font-sans text-xs text-white/65">
            {c.race} {c.archetype}
          </span>
        </span>
      </Button>
      {props.tag}
      {props.action && (
        <Button
          variant={props.action.variant ?? "outline"}
          size="xs"
          disabled={props.action.disabled}
          onClick={props.action.onClick}
          className="shrink-0 px-3"
        >
          {props.action.label}
        </Button>
      )}
    </li>
  )
}

// Tall art-first portrait gallery card for choosing a hero in the lobby.
export function HeroCard(props: {
  character: PC | PCTemplate
  onOpen?: () => void
  badge?: string
  action: { label: string; onClick: () => void; disabled?: boolean }
  className?: string
  style?: CSSProperties
}) {
  const c = props.character
  const flavor = heroFlavor(c)
  const level = c.sheet?.level

  return (
    <li
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0d0d13] transition-[transform,border-color,box-shadow] duration-200 ease-snap hover:-translate-y-0.5 hover:border-accent-300/45 hover:shadow-[0_18px_40px_rgba(0,0,0,0.65)]",
        props.className
      )}
      style={props.style}
    >
      <Button
        variant="plain"
        type="button"
        onClick={props.onOpen}
        className="relative aspect-[4/4.35] w-full overflow-hidden bg-[#050508] text-left focus-visible:ring-inset"
      >
        {c.image && (
          <Image
            src={pictureAt(c.image, 360)}
            alt={c.name}
            fill
            className="object-cover object-[50%_14%] transition-transform duration-300 ease-snap group-hover:scale-[1.04]"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#0d0d13] via-[#0d0d13]/75 to-transparent"
        />
        {props.badge && (
          <span className="absolute top-3 left-3 z-10 rounded-full border border-accent-300/40 bg-black/75 px-2.5 py-0.5 font-mono text-4xs uppercase tracking-label text-accent-200 backdrop-blur-sm">
            {props.badge}
          </span>
        )}
        <span className="absolute inset-x-3.5 bottom-2.5 z-10 block">
          <span className="block truncate font-display text-base leading-tight text-accent-200 transition-colors [text-shadow:0_2px_10px_#000] group-hover:text-accent-100 xl:text-lg">
            {c.name}
          </span>
          <span className="mt-0.5 block truncate font-sans text-xs font-medium text-white/80">
            {c.race} {c.archetype}
            {level ? <span className="text-white/55"> · Lv. {level}</span> : null}
          </span>
        </span>
      </Button>

      <div className="flex flex-1 flex-col gap-3 px-3.5 pt-2.5 pb-3.5">
        {flavor && (
          <p className="line-clamp-2 font-serif text-xs leading-relaxed text-white/60">
            {flavor}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Button
            variant="plain"
            type="button"
            onClick={props.onOpen}
            className="inline-flex items-center gap-1.5 font-sans text-xs text-white/55 transition-colors hover:text-accent-200 active:opacity-70"
          >
            <ScrollText aria-hidden="true" className="size-3.5" />
            <span>Sheet</span>
          </Button>
          <Button
            variant="primary"
            size="xs"
            disabled={props.action.disabled}
            onClick={props.action.onClick}
            className="shrink-0 px-3.5 font-sans font-semibold"
          >
            {props.action.label}
          </Button>
        </div>
      </div>
    </li>
  )
}

// Dashed tall gallery card for building a custom character alongside the premade portraits.
export function CreateHeroCard(props: { href?: string; onClick?: () => void; prominent?: boolean; className?: string; style?: CSSProperties }) {
  const cardClasses =
    "group flex h-full min-h-[270px] w-full flex-col items-center justify-center gap-3.5 rounded-xl border border-dashed border-white/20 bg-[radial-gradient(circle_at_50%_35%,rgba(252,211,77,0.06),rgba(13,13,19,0.92))] p-6 text-center transition-[transform,border-color,background-color,box-shadow] duration-200 ease-snap hover:-translate-y-0.5 hover:border-accent-300/45 hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)] active:scale-[0.99]"
  const inner = (
    <>
      <span className="grid size-16 place-items-center rounded-full border border-dashed border-accent-300/45 bg-accent-300/[0.06] text-accent-300 transition-colors group-hover:border-accent-200/70 group-hover:bg-accent-300/15 group-hover:text-accent-100">
        <Plus aria-hidden="true" className="size-7" />
      </span>
      <span className="font-display text-lg leading-snug text-white transition-colors group-hover:text-accent-200">
        Create New Character
      </span>
      <span className="max-w-[24ch] font-serif text-xs leading-relaxed text-white/55">
        Craft an original adventurer with your own species, class, and backstory.
      </span>
      <span className={buttonClassName(props.prominent ? "primary" : "outline", "sm", "mt-1 px-4 font-sans font-semibold")}>
        Open Builder
      </span>
    </>
  )

  return (
    <li className={cn("min-w-0", props.className)} style={props.style}>
      {props.onClick ? (
        <Button variant="plain" type="button" onClick={props.onClick} className={cardClasses}>
          {inner}
        </Button>
      ) : (
        <Link href={props.href ?? "#"} className={cardClasses}>
          {inner}
        </Link>
      )}
    </li>
  )
}

type Row = ReactElement<{ className?: string; style?: CSSProperties }>

// Longer than a row's exit.
const EXIT_MS = 150

// The rows of a lobby list. The rows there at first come in one after another, and a later one comes in as it joins.
// A row that leaves keeps its place while it goes out. Each row is keyed and takes `className` and `style`.
export function HeroRows({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement) as Row[]
  const keys = rows.map((row) => row.key).join(" ")
  const [first] = useState(() => new Map(rows.map((row, index) => [row.key, Math.min(index, 8)])))
  const [seen, setSeen] = useState(keys)
  const [gone, setGone] = useState<{ row: Row; at: number }[]>([])
  // The rows as last shown, so one that leaves goes out looking as it did.
  const last = useRef(rows)
  useLayoutEffect(() => {
    last.current = rows
  })
  if (seen !== keys) {
    const here = new Set(rows.map((row) => row.key))
    setSeen(keys)
    setGone([...gone.filter(({ row }) => !here.has(row.key)), ...last.current.flatMap((row, at) => (here.has(row.key) ? [] : [{ row, at }]))])
  }
  useEffect(() => {
    if (!gone.length) return
    const timer = setTimeout(() => setGone([]), prefersReducedMotion() ? 0 : EXIT_MS)
    return () => clearTimeout(timer)
  }, [gone])
  const list = rows.map((row) => cloneElement(row, { className: cn(row.props.className, "enter-rise"), style: { ...row.props.style, "--i": first.get(row.key) ?? 0 } as CSSProperties }))
  for (const { row, at } of gone) list.splice(Math.min(at, list.length), 0, cloneElement(row, { className: cn(row.props.className, "exit-rise") }))
  return list
}

// The small pill after a seated hero: who plays them.
export function HeroTag(props: { tone: "you" | "host" | "ai" | "player"; children: ReactNode }) {
  const tones = {
    you: "border-accent-300/35 bg-accent-300/15 text-accent-200",
    host: "border-accent-300/25 bg-accent-300/10 text-accent-200",
    ai: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    player: "border-primary-300/30 bg-primary-400/15 text-primary-100",
  }
  return (
    <span className={cn("max-w-28 shrink-0 truncate rounded-full border px-2.5 py-0.5 font-sans text-3xs font-medium", tones[props.tone])}>
      {props.children}
    </span>
  )
}
