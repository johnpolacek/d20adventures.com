"use client"

import type { LobbyInvite } from "@/components/adventure/adventure-lobby"
import type { FloorView } from "@/components/floorplan/view"
import AdventureHomeContent from "@/components/views/adventure-home-content"
import { AdventureProvider } from "@/lib/context/AdventureContext"
import { TurnProvider } from "@/lib/context/TurnContext"
import type { HeroCreation } from "@/lib/heroes/creation"
import type { Adventure, Turn as TurnType } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"

function AdventureHome({
  adventurePlanId,
  settingId,
  adventure,
  encounterImage,
  currentTurn,
  adventurePlan,
  disableSSE = false,
  floor,
  invite,
  hosted,
  creation,
}: {
  adventurePlanId: string
  settingId: string
  adventure: Adventure
  encounterImage: string
  currentTurn: TurnType | null
  adventurePlan?: AdventurePlan
  disableSSE?: boolean
  floor?: FloorView | null
  invite?: LobbyInvite
  hosted?: boolean
  creation?: HeroCreation
}) {
  return (
    <AdventureProvider settingId={settingId} adventurePlanId={adventurePlanId} adventure={adventure}>
      <TurnProvider adventureId={adventure?.id ?? ""} initialTurn={currentTurn} disableSSE={disableSSE}>
        <AdventureHomeContent
          initialImage={encounterImage}
          initialSubtitle={currentTurn?.title || ""}
          adventure={adventure}
          adventurePlan={adventurePlan}
          floor={floor}
          invite={invite}
          hosted={hosted}
          creation={creation}
        />
      </TurnProvider>
    </AdventureProvider>
  )
}

export default AdventureHome
