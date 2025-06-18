"use client"

import React, { useEffect, useState } from "react"
import ImageHeader from "@/components/ui/image-header"
import { Adventure } from "@/types/adventure"
import Turn from "@/components/adventure/turn"
import { useTurn } from "@/lib/context/TurnContext"
import { useParams } from "next/navigation"
import { ensureNpcProcessed } from "@/app/_actions/ensure-npc-processed"
import type { Id } from "@/convex/_generated/dataModel"
import wait from "waait"
import { scrollToTop } from "../ui/utils"
import AdventureLobby from "@/components/adventure/adventure-lobby"
import type { AdventurePlan } from "@/types/adventure-plan"
import { getImageUrl } from "@/lib/utils"

export const dynamic = "force-dynamic"

function AdventureHomeContent({ initialImage, adventure, adventurePlan }: { initialImage: string; initialSubtitle: string; adventure: Adventure; adventurePlan?: AdventurePlan }) {
  const { adventurePlanId, settingId } = useParams()
  const [image, setImage] = useState(initialImage)
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  const [lastEncounterId, setLastEncounterId] = useState<string | null>(null)

  const turn = useTurn()

  useEffect(() => {
    // Only update image if the encounter actually changed
    if (turn && turn.encounterId && turn.encounterId !== lastEncounterId) {
      console.log("[AdventureHomeContent] update image")
      // Try to get the image from the adventurePlan object
      let encounterImage: string | undefined = undefined
      if (adventurePlan) {
        for (const section of adventurePlan.sections) {
          for (const scene of section.scenes) {
            for (const encounter of scene.encounters) {
              if (encounter.id === turn.encounterId) {
                encounterImage = encounter.image
                break
              }
            }
          }
        }
      }
      console.log("[AdventureHomeContent] encounterImage", encounterImage)
      if (encounterImage) {
        console.log("[AdventureHomeContent] setImage to encounterImage", encounterImage)
        setImage(encounterImage)
      } else {
        const fallbackImage = `images/settings/${settingId}/${adventurePlanId}/${turn.encounterId}.png`
        console.log("[AdventureHomeContent] setImage to fallbackImage", fallbackImage)
        setImage(fallbackImage)
      }
      setLastEncounterId(turn.encounterId)
      wait(500).then(() => {
        scrollToTop()
      })
    }
  }, [turn?.encounterId, settingId, adventurePlanId, lastEncounterId, adventurePlan])

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

  useEffect(() => {
    console.log("[AdventureHomeContent] adventurePlan ", JSON.stringify(adventurePlan, null, 2))
  }, [])

  const imageUrl = getImageUrl(image)

  console.log("[AdventureHomeContent] imageUrl", imageUrl)
  console.log("[AdventureHomeContent] initialImage", initialImage)

  return (
    <>
      <div className="flex flex-col items-center min-h-screen relative">
        <ImageHeader variant={turn ? "default" : "compact"} imageUrl={imageUrl} title={adventure.title} subtitle={turn?.title} imageAlt={turn?.title || adventure.title} />
        {turn ? <Turn /> : <AdventureLobby adventure={adventure} adventurePlan={adventurePlan} />}
      </div>
    </>
  )
}

export default AdventureHomeContent
