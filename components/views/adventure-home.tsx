"use client"

import React from "react"
import { Adventure } from "@/types/adventure"
import type { Turn as TurnType } from "@/types/adventure"
import { TurnProvider } from "@/lib/context/TurnContext"
import { AdventureProvider } from "@/lib/context/AdventureContext"
import AdventureHomeContent from "@/components/views/adventure-home-content"

export const dynamic = "force-dynamic"

function AdventureHome({
  adventurePlanId,
  settingId,
  adventure,
  encounterImage,
  teaser,
  currentTurn,
  disableSSE = false,
}: {
  adventurePlanId: string
  settingId: string
  adventure: Adventure
  teaser?: string
  encounterImage: string
  currentTurn: TurnType | null
  disableSSE?: boolean
}) {
  return (
    <AdventureProvider settingId={settingId} adventurePlanId={adventurePlanId} adventure={adventure}>
      <TurnProvider adventureId={adventure?.id ?? ""} initialTurn={currentTurn} disableSSE={disableSSE}>
        <AdventureHomeContent initialImage={encounterImage} initialSubtitle={currentTurn?.title || ""} adventure={adventure} teaser={teaser} />
      </TurnProvider>
    </AdventureProvider>
  )
}

export default AdventureHome
