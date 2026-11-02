import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import Image from "@/components/ui/native-image"
import { cn, getImageUrl } from "@/lib/utils"
import type { PC, PCTemplate } from "@/types/character"

// A hero in a lobby list: portrait, name and class in one short row. The row opens the hero's sheet. A tag says who
// plays a seated hero, and an action joins with one not yet seated.
export function HeroRow(props: { character: PC | PCTemplate; onOpen?: () => void; tag?: ReactNode; action?: { label: string; onClick: () => void; disabled?: boolean }; mine?: boolean }) {
  const c = props.character
  return (
    <li className={cn("flex min-w-0 items-center gap-3 rounded-lg border bg-black/60 p-2", props.mine ? "border-amber-400/60" : "border-white/10")}>
      <button type="button" onClick={props.onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-md border border-white/20 bg-white/5">
          {c.image && <Image src={getImageUrl(c.image)} alt="" fill className="object-cover object-[50%_15%]" onError={(e) => (e.currentTarget.style.display = "none")} />}
        </span>
        <span className="min-w-0">
          <span className={cn("block truncate font-display text-base", props.mine && "text-amber-400")}>{c.name}</span>
          <span className="block truncate text-xs text-white/70">
            {c.race} {c.archetype}
          </span>
        </span>
      </button>
      {props.tag}
      {props.action && (
        <Button variant="outline" size="sm" disabled={props.action.disabled} onClick={props.action.onClick} className="shrink-0">
          {props.action.label}
        </Button>
      )}
    </li>
  )
}

// The small label after a seated hero: who plays them.
export function HeroTag(props: { tone: "you" | "ai" | "player"; children: ReactNode }) {
  const tones = { you: "bg-amber-800 text-amber-200", ai: "bg-sky-900 text-sky-200", player: "bg-primary-700 text-primary-200" }
  return <span className={cn("max-w-28 shrink-0 truncate rounded-sm px-2 py-0.5 font-mono text-xs font-bold tracking-wider", tones[props.tone])}>{props.children}</span>
}
