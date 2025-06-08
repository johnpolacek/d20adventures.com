"use client"

import React, { useEffect, useState } from "react"
import { IMAGE_HOST } from "@/lib/config"
import ImageHeader from "@/components/ui/image-header"
import { Adventure } from "@/types/adventure"
import Turn from "@/components/adventure/turn"
import { useTurn } from "@/lib/context/TurnContext"
import { useParams } from "next/navigation"
import { ensureNpcProcessed } from "@/app/_actions/ensure-npc-processed"
import { getEncounterImage } from "@/app/_actions/get-encounter-image"
import type { Id } from "@/convex/_generated/dataModel"
import wait from "waait"
import { scrollToTop } from "../ui/utils"

export const dynamic = "force-dynamic"

function AdventureHomeContent({ initialImage, adventure, teaser }: { initialImage: string; initialSubtitle: string; adventure: Adventure; teaser?: string }) {
  const { adventurePlanId, settingId } = useParams()
  const [image, setImage] = useState(initialImage)
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  const [lastEncounterId, setLastEncounterId] = useState<string | null>(null)

  const turn = useTurn()

  useEffect(() => {
    // Only update image if the encounter actually changed
    if (turn && turn.encounterId && turn.encounterId !== lastEncounterId) {
      getEncounterImage(adventurePlanId as string, turn.encounterId)
        .then((encounterImage) => {
          if (encounterImage) {
            setImage(encounterImage)
          } else {
            const fallbackImage = `images/settings/${settingId}/${adventurePlanId}/${turn.encounterId}.png`
            setImage(fallbackImage)
          }
          setLastEncounterId(turn.encounterId)

          wait(500).then(() => {
            scrollToTop()
          })
        })
        .catch((error) => {
          console.error("[AdventureHomeContent] Error getting encounter image:", error)
          // Fallback to simple path pattern
          const fallbackImage = `images/settings/${settingId}/${adventurePlanId}/${turn.encounterId}.png`
          console.log("[AdventureHomeContent] Using fallback image after error:", fallbackImage)
          setImage(fallbackImage)
          setLastEncounterId(turn.encounterId)

          wait(500).then(() => {
            scrollToTop()
          })
        })
    }
  }, [turn?.encounterId, settingId, adventurePlanId, lastEncounterId])

  // Set initial lastEncounterId when component first loads
  useEffect(() => {
    if (turn?.encounterId && !lastEncounterId) {
      setLastEncounterId(turn.encounterId)
    }
  }, [turn?.encounterId, lastEncounterId])

  useEffect(() => {
    if (turn && turn.id && !initialCheckDone) {
      setInitialCheckDone(true)

      const characters = turn.characters || []
      const sortedCharacters = [...characters].sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
      const currentActor = sortedCharacters.find((c) => !c.isComplete)

      if (currentActor && currentActor.type === "npc" && !currentActor.hasReplied) {
        console.log(`[AdventureHomeContent] Initial turn load: NPC (${currentActor.id}) waiting for turn ${turn.id}. Triggering check.`)
        ensureNpcProcessed(turn.id as Id<"turns">)
          .then((result) => {
            console.log(`[AdventureHomeContent] ensureNpcProcessed result:`, result)
          })
          .catch((error) => {
            console.error(`[AdventureHomeContent] Error calling ensureNpcProcessed:`, error)
          })
      }
    }
  }, [turn, initialCheckDone])

  return (
    <>
      <div className="flex flex-col items-center min-h-screen relative">
        <ImageHeader imageUrl={`${IMAGE_HOST}/${image}`} title={adventure.title} subtitle={turn?.title} imageAlt={turn?.title || adventure.title} />
        {turn ? (
          <Turn />
        ) : (
          <div className="grow max-w-2xl fade-in">
            <p className="text-sm sm:text-base md:text-lg whitespace-pre-line">{teaser}</p>
          </div>
        )}
      </div>
    </>
  )
}

export default AdventureHomeContent
