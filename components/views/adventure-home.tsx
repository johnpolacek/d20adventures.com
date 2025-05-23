"use client"

import React, { useEffect } from "react"
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
}: {
  adventurePlanId: string
  settingId: string
  adventure: Adventure
  teaser?: string
  encounterImage: string
  currentTurn: TurnType | null
}) {
  useEffect(() => {
    console.log("[AdventureHome]", JSON.stringify({ currentTurn, encounterImage }, null, 2))
    console.log("[AdventureHome]", JSON.stringify({ currentTurn, encounterImage }, null, 2))
  }, [currentTurn?.id])

  return (
    <AdventureProvider settingId={settingId} adventurePlanId={adventurePlanId} adventure={adventure}>
      <TurnProvider adventureId={adventure?.id ?? ""} initialTurn={currentTurn}>
        <AdventureHomeContent initialImage={encounterImage} initialSubtitle={currentTurn?.title || ""} adventure={adventure} teaser={teaser} />
      </TurnProvider>
    </AdventureProvider>
  )
}

export default AdventureHome
