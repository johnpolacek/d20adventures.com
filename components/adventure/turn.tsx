"use client"

import type { AdventureEncounter } from "@/types/adventure-plan"
import GameChat from "./game-chat"
import TurnCharacterList from "./turn-character-list"
import TurnNarrative from "./turn-narrative"

export default function Turn({ nextAdventure, encounter }: { nextAdventure?: string; encounter?: AdventureEncounter | null }) {
  return (
    <div className="relative flex flex-col gap-4 px-8 pb-24 lg:flex-row lg:gap-8">
      <TurnCharacterList />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <TurnNarrative nextAdventure={nextAdventure} />
      </div>
      <div className="fixed right-8 top-20 z-50">
        <GameChat />
      </div>
    </div>
  )
}
