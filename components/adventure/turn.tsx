"use client"

import type { MapTokens } from "@/components/mapview/encounter-map-2d"
import { MapPanel } from "@/components/mapview/map-panel"
import type { AdventureEncounter } from "@/types/adventure-plan"
import type { Encounter2DMap } from "@/types/encounter-map-2d"
import GameChat from "./game-chat"
import TurnCharacterList from "./turn-character-list"
import TurnNarrative from "./turn-narrative"

export default function Turn({
  nextAdventure,
  encounter,
  encounterMap,
  mapTokens,
}: {
  nextAdventure?: string
  encounter?: AdventureEncounter | null
  encounterMap?: Encounter2DMap | null
  mapTokens?: MapTokens
}) {
  return (
    <div className="relative flex flex-col gap-4 px-8 pb-24 lg:flex-row lg:gap-8">
      <TurnCharacterList />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <TurnNarrative nextAdventure={nextAdventure} />
      </div>
      <div className="fixed right-8 top-20 z-50 flex items-center gap-4">
        {encounterMap && <MapPanel map={encounterMap} encounterTitle={encounter?.title} tokens={mapTokens} />}
        <GameChat />
      </div>
    </div>
  )
}
