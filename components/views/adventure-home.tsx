"use client"

import { useEffect } from "react"
import type { AdventurePlan } from "@/types/adventure-plan"
import { IMAGE_HOST } from "@/lib/config"
import ImageHeader from "@/components/ui/image-header"
import { thalbern } from "@/data/demo"
import { TurnCharacter, Adventure } from "@/types/adventure"
import Turn from "@/components/adventure/turn"
import { useTurnStore } from "@/lib/store/turn-store"

function findFirstEncounter(adventurePlan: AdventurePlan) {
  const startId = adventurePlan.start
  for (const section of adventurePlan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        if (encounter.id === startId) {
          return encounter
        }
      }
    }
  }
  return null
}

export default function AdventureHome({ adventurePlan, isDemo }: { adventurePlan: AdventurePlan; isDemo?: boolean }) {
  const firstEncounter = findFirstEncounter(adventurePlan)

  if (!firstEncounter) {
    return <div>Sorry, there was an error loading this adventure. Please try again later.</div>
  }

  const imageUrl = firstEncounter?.image ? `${IMAGE_HOST}/${firstEncounter.image}` : adventurePlan.image ? `${IMAGE_HOST}${adventurePlan.image}` : "/images/app/backgrounds/d20-hero.png"

  // Use isDemo for demo-specific logic if needed
  const now = new Date().toISOString()

  let adventure: Adventure | null = null

  if (isDemo) {
    const demoPC: TurnCharacter = {
      ...thalbern,
      userId: "demo-user",
      initiative: 10,
    }
    adventure = {
      id: `demo-${now}`,
      adventurePlanId: adventurePlan.id,
      settingId: (adventurePlan as any).settingId || "demo-setting",
      party: [demoPC],
      turns: [
        {
          encounterId: firstEncounter.id,
          title: adventurePlan.title,
          subtitle: firstEncounter.title,
          narrative: firstEncounter.intro || "The adventure begins...",
          characters: [demoPC],
        },
      ],
      startedAt: now,
    }
  }

  const adventureTurn = adventure?.turns[0]

  // Load the demo adventure turn into the Zustand store
  const setCurrentTurn = useTurnStore((state) => state.setCurrentTurn)
  useEffect(() => {
    if (isDemo && adventureTurn) {
      setCurrentTurn(adventureTurn)
    }
  }, [isDemo, adventureTurn, setCurrentTurn])

  return (
    <div className="flex flex-col items-center min-h-screen relative">
      <ImageHeader imageUrl={imageUrl} title={adventureTurn ? adventureTurn?.title : adventurePlan.title} subtitle={adventureTurn?.subtitle} imageAlt={firstEncounter?.title || adventurePlan.title} />
      {adventureTurn ? (
        <Turn adventurePlan={adventurePlan} />
      ) : (
        <div className="grow max-w-2xl fade-in">
          <p className="text-sm sm:text-base md:text-lg whitespace-pre-line">{adventurePlan.teaser}</p>
        </div>
      )}
    </div>
  )
}
