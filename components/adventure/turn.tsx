"use client"

import { useAdventure } from "@/lib/context/AdventureContext"
import { useTurnContext } from "@/lib/context/TurnContext"
import type { AdventureEncounter } from "@/types/adventure-plan"
import dynamic from "next/dynamic"
import { buildRuntimeMapTokens } from "./miniatures-map"
import GameChat from "./game-chat"
import TurnCharacterList from "./turn-character-list"
import TurnNarrative from "./turn-narrative"

const MiniaturesMap = dynamic(() => import("./miniatures-map"), {
  ssr: false,
})

export default function Turn({ nextAdventure, encounter }: { nextAdventure?: string; encounter?: AdventureEncounter | null }) {
  const { adventure } = useAdventure()
  const { currentTurn } = useTurnContext()
  const partySlotOrder = adventure.party.map((character) => character.id)
  const tokens = currentTurn && encounter?.map3d ? buildRuntimeMapTokens({ map: encounter.map3d, characters: currentTurn.characters, partySlotOrder }) : []

  return (
    <div className="relative flex flex-col gap-4 px-8 pb-24 lg:flex-row lg:gap-8">
      <TurnCharacterList />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {encounter?.map3d && currentTurn ? <MiniaturesMap map={encounter.map3d} tokens={tokens} title={currentTurn.title} className="w-full" /> : null}
        <TurnNarrative nextAdventure={nextAdventure} />
      </div>
      <div className="fixed right-8 top-20 z-50">
        <GameChat />
      </div>
    </div>
  )
}
