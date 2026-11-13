// A hero's magic items, one line each: the name, what the rules add for it, and whether it is attuned. Shared by the
// stage's character card and the site's character sheet.

import type { ItemView } from "@d20/gm-core/sheet/items"
import { cn } from "@/lib/utils"
import { eyebrow } from "./hud"

export function MagicItems({ items, className }: { items: readonly ItemView[]; className?: string }) {
  if (!items.length) return null
  return (
    <div className={className}>
      <h3 className={cn(eyebrow, "mb-2")}>Magic Items</h3>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={`${index}:${item.name}`} className="flex flex-wrap items-baseline gap-x-2 text-xs leading-relaxed">
            <span className="font-serif text-[13px] text-stage-cream">{item.name}</span>
            <span className="text-stage-muted">{item.gives ?? item.kind}</span>
            {item.attuned !== undefined && (
              <span className={cn("text-[10px] uppercase tracking-[0.14em]", item.attuned ? "text-stage-gold" : "text-stage-muted")}>{item.attuned ? "Attuned" : "Not Attuned"}</span>
            )}
            {item.unworn && <span className="text-[10px] uppercase tracking-[0.14em] text-stage-muted">Not In Use</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
