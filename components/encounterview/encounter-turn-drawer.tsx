"use client"

// Right-side turn drawer inside the encounter view. Deliberately not a modal:
// the 3D scene stays visible and interactive to its left, re-centering in the
// remaining space as the drawer's width animates in. Hosts the same
// TurnNarrativeBody the turn page renders (narrative history, reply with AI
// generate, dice rolls, skip/defer, turn advance).

import { XIcon } from "lucide-react"
import { useState } from "react"
import TurnNarrativeBody from "@/components/adventure/turn-narrative-body"
import { Switch } from "@/components/ui/switch"
import { useTurn } from "@/lib/context/TurnContext"
import { cn } from "@/lib/utils"

export default function EncounterTurnDrawer({ open, onClose, nextAdventure }: { open: boolean; onClose: () => void; nextAdventure?: string }) {
  const [showOriginalReplies, setShowOriginalReplies] = useState(false)
  const turn = useTurn()
  if (!turn) return null

  return (
    <aside
      inert={!open}
      aria-label="Turn details"
      className={cn(
        "flex h-full flex-none overflow-hidden bg-stone-950 text-stone-100 transition-[width] duration-300 ease-in-out",
        open ? "w-full border-l border-white/10 sm:w-[26rem] lg:w-[30rem]" : "w-0"
      )}
    >
      {/* Fixed-width inner wrapper so the content doesn't reflow while the
          drawer's width animates. */}
      <div className="flex h-full w-screen flex-none flex-col sm:w-[26rem] lg:w-[30rem]">
        <header className="flex flex-none items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
          <h3 className="min-w-0 truncate font-display text-lg text-amber-200">{turn.title || "This Turn"}</h3>
          <div className="flex flex-none items-center gap-3">
            <label htmlFor="drawer-show-original-replies" className="flex cursor-pointer items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">Show Original Replies</span>
              <span className="scale-75">
                <Switch checked={showOriginalReplies} onCheckedChange={setShowOriginalReplies} id="drawer-show-original-replies" />
              </span>
            </label>
            <button type="button" onClick={onClose} className="rounded p-1 text-stone-300 transition-colors hover:bg-white/10 hover:text-amber-200" aria-label="Close turn drawer">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-5">
          <TurnNarrativeBody variant="drawer" showOriginalReplies={showOriginalReplies} nextAdventure={nextAdventure} />
        </div>
      </div>
    </aside>
  )
}
