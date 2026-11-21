import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties, ReactElement, ReactNode } from "react"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { cn, getImageUrl } from "@/lib/utils"
import type { PC, PCTemplate } from "@/types/character"

// A hero in a lobby list: portrait, name and class in one short row. The row opens the hero's sheet. A tag says who
// plays a seated hero, and an action joins with one not yet seated.
export function HeroRow(props: {
  character: PC | PCTemplate
  onOpen?: () => void
  tag?: ReactNode
  action?: { label: string; onClick: () => void; disabled?: boolean }
  mine?: boolean
  className?: string
  style?: CSSProperties
}) {
  const c = props.character
  return (
    <li className={cn("flex min-w-0 items-center gap-3 rounded-lg border bg-black/60 p-2", props.mine ? "border-accent-400/60" : "border-white/10", props.className)} style={props.style}>
      <Button variant="plain" type="button" onClick={props.onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity duration-100 hover:opacity-80 active:opacity-60">
        <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-md border border-white/20 bg-white/5">
          {c.image && <Image src={getImageUrl(c.image)} alt="" fill className="object-cover object-[50%_15%]" onError={(e) => (e.currentTarget.style.display = "none")} />}
        </span>
        <span className="min-w-0">
          <span className={cn("block truncate font-display text-base", props.mine && "text-accent-400")}>{c.name}</span>
          <span className="block truncate text-xs text-white/70">
            {c.race} {c.archetype}
          </span>
        </span>
      </Button>
      {props.tag}
      {props.action && (
        <Button variant="outline" size="sm" disabled={props.action.disabled} onClick={props.action.onClick} className="shrink-0">
          {props.action.label}
        </Button>
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
    const timer = setTimeout(() => setGone([]), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : EXIT_MS)
    return () => clearTimeout(timer)
  }, [gone])
  const list = rows.map((row) => cloneElement(row, { className: cn(row.props.className, "enter-rise"), style: { ...row.props.style, "--i": first.get(row.key) ?? 0 } as CSSProperties }))
  for (const { row, at } of gone) list.splice(Math.min(at, list.length), 0, cloneElement(row, { className: cn(row.props.className, "exit-rise") }))
  return list
}

// The small label after a seated hero: who plays them.
export function HeroTag(props: { tone: "you" | "ai" | "player"; children: ReactNode }) {
  const tones = { you: "bg-accent-800 text-accent-200", ai: "bg-sky-900 text-sky-200", player: "bg-primary-700 text-primary-200" }
  return <span className={cn("max-w-28 shrink-0 truncate rounded-sm px-2 py-0.5 font-mono text-xs font-bold tracking-wide", tones[props.tone])}>{props.children}</span>
}
