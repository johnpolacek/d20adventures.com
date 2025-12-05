"use client"

import AdventureHomeContent from "@/components/views/adventure-home-content"
import { AdventureProvider } from "@/lib/context/AdventureContext"
import { TurnProvider } from "@/lib/context/TurnContext"
import type { Adventure } from "@/types/adventure"
import type { Turn as TurnType } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import React from "react"

function AdventureHome({
  adventurePlanId,
  settingId,
  adventure,
  encounterImage,
  currentTurn,
  adventurePlan,
  disableSSE = false,
}: {
  adventurePlanId: string
  settingId: string
  adventure: Adventure
  encounterImage: string
  currentTurn: TurnType | null
  adventurePlan?: AdventurePlan
  disableSSE?: boolean
}) {
  return (
    <AdventureProvider settingId={settingId} adventurePlanId={adventurePlanId} adventure={adventure}>
      <TurnProvider adventureId={adventure?.id ?? ""} initialTurn={currentTurn} disableSSE={disableSSE}>
        <AdventureHomeContent initialImage={encounterImage} initialSubtitle={currentTurn?.title || ""} adventure={adventure} adventurePlan={adventurePlan} />
      </TurnProvider>
    </AdventureProvider>
  )
}

export default AdventureHome
