"use client"

import React, { useEffect, useState } from "react"
import { IMAGE_HOST } from "@/lib/config"
import ImageHeader from "@/components/ui/image-header"
import { Adventure } from "@/types/adventure"
import Turn from "@/components/adventure/turn"
import { useTurn } from "@/lib/context/TurnContext"
import { useParams } from "next/navigation"
import { ensureNpcProcessed } from "@/app/_actions/ensure-npc-processed"
import type { Id } from "@/convex/_generated/dataModel"
import wait from "waait"
import { scrollToTop } from "../ui/utils"

export const dynamic = "force-dynamic"

function AdventureHomeContent({ initialImage, adventure, teaser }: { initialImage: string; initialSubtitle: string; adventure: Adventure; teaser?: string }) {
  const { adventurePlanId, settingId } = useParams()
  const [image, setImage] = useState(initialImage)
  const [initialCheckDone, setInitialCheckDone] = useState(false)

  const turn = useTurn()

  useEffect(() => {
    console.log("[AdventureHomeContent] turn encounterId", turn?.encounterId)
    if (turn) {
      const newImage = `images/settings/${settingId}/${adventurePlanId}/${turn.encounterId}.png`
      console.log("[AdventureHomeContent] image check", { newImage, image })
      if (turn.encounterId && image !== newImage) {
        setImage(newImage)
        wait(500).then(() => {
          scrollToTop()
        })
      }
    }
  }, [turn?.encounterId, settingId, adventurePlanId])

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
