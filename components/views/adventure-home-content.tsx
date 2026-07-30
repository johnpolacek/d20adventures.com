"use client"

import { useUser } from "@clerk/nextjs"
import { useParams, usePathname } from "next/navigation"
import React, { useEffect, useState } from "react"
import wait from "waait"
import { ensureNpcProcessed } from "@/app/_actions/ensure-npc-processed"
import AdventureLobby from "@/components/adventure/adventure-lobby"
import Turn from "@/components/adventure/turn"
import type { MapTokens } from "@/components/mapview/encounter-map-2d"
import AccountRequired from "@/components/nav/account-required"
import ImageHeader from "@/components/ui/image-header"
import type { Id } from "@/convex/_generated/dataModel"
import { useTurn } from "@/lib/context/TurnContext"
import { findEncounterById } from "@/lib/map-utils"
import { cn, getImageUrl } from "@/lib/utils"
import { findCurrentActor, hasPendingAutonomousAction } from "@/lib/utils/turn-actors"
import type { Adventure } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Encounter2DMap } from "@/types/encounter-map-2d"
import { scrollToTop } from "../ui/utils"

export const dynamic = "force-dynamic"

function AdventureHomeContent({
  initialImage,
  adventure,
  adventurePlan,
  encounterMap,
  mapTokens,
}: {
  initialImage: string
  initialSubtitle: string
  adventure: Adventure
  adventurePlan?: AdventurePlan
  encounterMap?: Encounter2DMap | null
  mapTokens?: MapTokens
}) {
  const { adventurePlanId, settingId } = useParams()
  const { isSignedIn, isLoaded } = useUser()
  const pathname = usePathname()
  const [image, setImage] = useState(initialImage)
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  const [lastEncounterId, setLastEncounterId] = useState<string | null>(null)

  const turn = useTurn()

  useEffect(() => {
    // Only update image if the encounter actually changed
    if (turn?.encounterId && turn.encounterId !== lastEncounterId) {
      // Try to get the image from the adventurePlan object
      let encounterImage: string | undefined
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
    }
  }, [turn?.encounterId, settingId, adventurePlanId, lastEncounterId, adventurePlan])

  // Set initial lastEncounterId when component first loads
  useEffect(() => {
    if (turn?.encounterId && !lastEncounterId) {
      setLastEncounterId(turn.encounterId)
    }
  }, [turn?.encounterId, lastEncounterId])

  useEffect(() => {
    if (turn?.id && !initialCheckDone) {
      setInitialCheckDone(true)

      const currentActor = findCurrentActor(turn.characters || [])

      if (currentActor && hasPendingAutonomousAction(currentActor) && !turn.isFinalEncounter) {
        console.log(`[AdventureHomeContent] Initial turn load: autonomous actor (${currentActor.id}) waiting for turn ${turn.id}. Triggering check.`)
        ensureNpcProcessed(turn.id as Id<"turns">)
          .then((result) => {
            console.log("[AdventureHomeContent] ensureNpcProcessed result:", result)
          })
          .catch((error) => {
            console.error("[AdventureHomeContent] Error calling ensureNpcProcessed:", error)
          })
      }
    }
  }, [turn, initialCheckDone])

  const imageUrl = getImageUrl(image)
  const currentEncounter = React.useMemo(() => findEncounterById(adventurePlan?.sections || [], turn?.encounterId), [adventurePlan?.sections, turn?.encounterId])

  return (
    <div className={cn("flex flex-col items-center relative", isSignedIn && "min-h-screen")}>
      <ImageHeader variant={turn ? "default" : "compact"} imageUrl={imageUrl} title={adventure.title} subtitle={turn?.title} imageAlt={turn?.title || adventure.title} />
      {turn ? (
        <Turn nextAdventure={adventurePlan?.nextAdventure} encounter={currentEncounter} encounterMap={encounterMap} mapTokens={mapTokens} isSolo={(adventurePlan?.party?.[1] ?? 1) === 1} />
      ) : (
        <>
          <AdventureLobby adventure={adventure} adventurePlan={adventurePlan} />
          {!isSignedIn && isLoaded && (
            <div className="-mt-12 pb-24">
              <AccountRequired redirectUrl={pathname} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default AdventureHomeContent
