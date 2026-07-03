"use client"

import type { MapTokens } from "@/components/mapview/encounter-map-2d"
import { MapPanel, MapRailPanel } from "@/components/mapview/map-panel"
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
    <div className="relative mx-auto w-full max-w-[1536px] flex flex-col gap-4 px-6 sm:px-8 pb-24 lg:grid lg:grid-cols-[336px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[336px_minmax(0,1fr)_360px] 2xl:grid-cols-[336px_minmax(0,1fr)_400px] 2xl:gap-8">
      {/* Left rail: character list. The negative margin + padding keeps the initiative
          badges (which hang outside the cards) from being clipped by the scroll area. */}
      <div className="lg:sticky lg:top-20 lg:-ml-6 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-4 lg:pl-6 lg:pr-1">
        <TurnCharacterList />
      </div>

      {/* Center: narrative */}
      <div className="flex min-w-0 flex-col gap-6">
        <TurnNarrative nextAdventure={nextAdventure} />
      </div>

      {/* Right rail (wide desktop): mini map on top, docked chat filling the rest */}
      <aside className="hidden xl:sticky xl:top-20 xl:flex xl:h-[calc(100vh-7rem)] xl:flex-col xl:gap-4">
        {encounterMap && <MapRailPanel map={encounterMap} encounterTitle={encounter?.title} tokens={mapTokens} className="flex-none" />}
        <GameChat variant="rail" className="min-h-0 flex-1" />
      </aside>

      {/* Below xl: floating map + chat buttons (the rail is hidden) */}
      <div className="fixed right-4 top-20 z-50 flex items-center gap-3 xl:hidden">
        {encounterMap && <MapPanel map={encounterMap} encounterTitle={encounter?.title} tokens={mapTokens} />}
        <GameChat />
      </div>
    </div>
  )
}
