"use client"

import type { LobbyInvite } from "@/components/adventure/adventure-lobby"
import type { MapTokens } from "@/components/mapview/encounter-map-2d"
import AdventureHomeContent from "@/components/views/adventure-home-content"
import { AdventureProvider } from "@/lib/context/AdventureContext"
import { TurnProvider } from "@/lib/context/TurnContext"
import type { Adventure, Turn as TurnType } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Encounter2DMap } from "@/types/encounter-map-2d"

function AdventureHome({
  adventurePlanId,
  settingId,
  adventure,
  encounterImage,
  currentTurn,
  adventurePlan,
  disableSSE = false,
  encounterMap,
  mapTokens,
  invite,
  hosted,
}: {
  adventurePlanId: string
  settingId: string
  adventure: Adventure
  encounterImage: string
  currentTurn: TurnType | null
  adventurePlan?: AdventurePlan
  disableSSE?: boolean
  encounterMap?: Encounter2DMap | null
  mapTokens?: MapTokens
  invite?: LobbyInvite
  hosted?: boolean
}) {
  return (
    <AdventureProvider settingId={settingId} adventurePlanId={adventurePlanId} adventure={adventure}>
      <TurnProvider adventureId={adventure?.id ?? ""} initialTurn={currentTurn} disableSSE={disableSSE}>
        <AdventureHomeContent
          initialImage={encounterImage}
          initialSubtitle={currentTurn?.title || ""}
          adventure={adventure}
          adventurePlan={adventurePlan}
          encounterMap={encounterMap}
          mapTokens={mapTokens}
          invite={invite}
          hosted={hosted}
        />
      </TurnProvider>
    </AdventureProvider>
  )
}

export default AdventureHome
