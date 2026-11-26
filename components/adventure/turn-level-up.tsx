"use client"

// The levels this player's heroes are owed: a button for each, and the level-up screen it opens. The engine checks
// the choices, and the levelled hero is kept in the player's account.

import { useUser } from "@clerk/nextjs"
import { inFight, levelOwed } from "@d20/gm-core/sheet/level-owed"
import { useState } from "react"
import { levelUpHero } from "@/app/_actions/adventure"
import { LevelUp } from "@d20/ui/stage/level-up"
import { Button } from "@d20/ui/button"
import { Presence } from "@d20/ui/presence"
import type { Id } from "@/convex/_generated/dataModel"
import { useTurnContext } from "@/lib/context/TurnContext"
import { pictureAt } from "@/lib/images"
import { controlsHero } from "./turn-reaction"

export function TurnLevelUp({ className }: { className?: string }) {
  const { currentTurn } = useTurnContext()
  const { user } = useUser()
  const [open, setOpen] = useState<string | null>(null)
  if (!currentTurn) return null
  // A level is taken once a fight is over.
  const owed = inFight(currentTurn) ? [] : currentTurn.characters.filter((character) => controlsHero(character, user?.id) && levelOwed(character))
  const hero = owed.find((character) => character.id === open)
  // The screen is beside the buttons, not inside them, so it stays for its exit when the last level is taken.
  return (
    <>
      <Presence show={owed.length > 0} asChild>
        <div className={className}>
          <div className="flex flex-wrap justify-center gap-3">
            {owed.map((character) => (
              <Button key={character.id} size="sm" variant="epic" onClick={() => setOpen(character.id)}>
                Level Up {character.name}
              </Button>
            ))}
          </div>
        </div>
      </Presence>
      <Presence show={Boolean(hero?.sheet)} motion="fade" asChild>
        {hero?.sheet && (
          <div className="fixed inset-0 z-overlay flex items-center justify-center bg-black/70 p-3 text-left">
            <LevelUp
              hero={hero.name}
              portrait={hero.image ? pictureAt(hero.image, 64) : undefined}
              sheet={hero.sheet}
              className="enter-pop max-h-[92vh] w-[min(600px,100%)]"
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
      </Presence>
    </>
  )
}
