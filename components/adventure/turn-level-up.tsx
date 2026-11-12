"use client"

// The level a finished adventure owes this player's heroes: a button for each on the ending, and the level-up screen
// it opens. The engine checks the choices, and the levelled hero is kept in the player's account.

import { useUser } from "@clerk/nextjs"
import { levelOwed } from "@d20/gm-core/sheet/level-owed"
import { useState } from "react"
import { levelUpHero } from "@/app/_actions/adventure"
import { LevelUp } from "@/components/stage/level-up"
import { Button } from "@/components/ui/button"
import type { Id } from "@/convex/_generated/dataModel"
import { useAdventure } from "@/lib/context/AdventureContext"
import { useTurnContext } from "@/lib/context/TurnContext"
import { getImageUrl } from "@/lib/utils"
import { controlsHero } from "./turn-reaction"

export function TurnLevelUp({ className }: { className?: string }) {
  const { currentTurn } = useTurnContext()
  const { adventurePlanId } = useAdventure()
  const { user } = useUser()
  const [open, setOpen] = useState<string | null>(null)
  if (!currentTurn?.isFinalEncounter) return null
  const owed = currentTurn.characters.filter((character) => controlsHero(character, user?.id) && levelOwed(character, adventurePlanId, true))
  const hero = owed.find((character) => character.id === open)
  if (!owed.length) return null
  return (
    <div className={className}>
      <div className="flex flex-wrap justify-center gap-3">
        {owed.map((character) => (
          <Button key={character.id} size="sm" variant="epic" onClick={() => setOpen(character.id)}>
            Level Up {character.name}
          </Button>
        ))}
      </div>
      {hero?.sheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 text-left">
          <LevelUp
            hero={hero.name}
            portrait={hero.image ? getImageUrl(hero.image) : undefined}
            sheet={hero.sheet}
            className="max-h-[92vh] w-[min(600px,100%)]"
            onClose={() => setOpen(null)}
            onTake={async (choices) => {
              const taken = await levelUpHero({ turnId: currentTurn.id as Id<"turns">, characterId: hero.id, choices })
              if (taken.problems) return `${taken.problems.join(". ")}.`
              setOpen(null)
              return undefined
            }}
          />
        </div>
      )}
    </div>
  )
}
