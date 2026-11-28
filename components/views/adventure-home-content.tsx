"use client"

import { useUser } from "@clerk/nextjs"
import { useParams, usePathname } from "next/navigation"
import React, { useEffect, useState } from "react"
import wait from "waait"
import AdventureLobby, { type LobbyInvite } from "@/components/adventure/adventure-lobby"
import { InviteSignIn } from "@/components/adventure/invite-sign-in"
import Turn from "@/components/adventure/turn"
import type { FloorView } from "@/components/floorplan/view"
import AccountRequired from "@/components/nav/account-required"
import ImageHeader from "@d20/ui/image-header"
import { Presence } from "@d20/ui/presence"
import { useTurn } from "@/lib/context/TurnContext"
import type { HeroCreation } from "@/lib/heroes/creation"
import { findEncounterById } from "@/lib/map-utils"
import { headerImage } from "@/lib/images"
import { cn } from "@/lib/utils"
import type { Adventure } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import { scrollToTop } from "@d20/ui/scroll"

function AdventureHomeContent({
  initialImage,
  adventure,
  adventurePlan,
  floor,
  invite,
  hosted,
  creation,
}: {
  initialImage: string
  initialSubtitle: string
  adventure: Adventure
  adventurePlan?: AdventurePlan
  floor?: FloorView | null
  invite?: LobbyInvite
  // A hosted game plays on its own page, with the GM in the host's app.
  hosted?: boolean
  creation?: HeroCreation
}) {
  const { adventurePlanId, settingId } = useParams()
  const { isSignedIn, isLoaded } = useUser()
  const pathname = usePathname()
  const [image, setImage] = useState(initialImage)
  const [lastEncounterId, setLastEncounterId] = useState<string | null>(null)

  const turn = useTurn()
  // When the host starts, everyone waiting in the lobby leaves for the play page.
  const startedHosted = Boolean(hosted && turn)
  useEffect(() => {
    if (startedHosted) window.location.assign(`/play/${adventure.id}`)
  }, [startedHosted, adventure.id])

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

  const currentEncounter = React.useMemo(() => findEncounterById(adventurePlan?.sections || [], turn?.encounterId), [adventurePlan?.sections, turn?.encounterId])

  const redirectUrl = invite?.as ? `${pathname}?as=${encodeURIComponent(invite.as)}` : pathname
  // The lobby, before the game starts: the cover and first sentence over sign in, or over the party and heroes.
  // Until sign-in is known, nothing paints: the cover and all below it enter together once it is.
  if ((!turn || hosted) && adventurePlan && !isLoaded) return <div className="min-h-screen" />
  if ((!turn || hosted) && adventurePlan)
    return isSignedIn ? (
      <AdventureLobby adventure={adventure} adventurePlan={adventurePlan} invite={invite} hosted={hosted} creation={creation} />
    ) : (
      <InviteSignIn plan={adventurePlan} redirectUrl={redirectUrl} />
    )

  return (
    <div className={cn("flex flex-col items-center relative", isSignedIn && "min-h-screen")}>
      <ImageHeader variant={turn ? "default" : "compact"} {...headerImage(image)} title={adventure.title} subtitle={turn?.title} imageAlt={turn?.title || adventure.title} />
      {turn && !hosted ? (
        <Turn nextAdventure={adventurePlan?.nextAdventure} encounter={currentEncounter} floor={floor} isSolo={(adventurePlan?.party?.[1] ?? 1) === 1} />
      ) : (
        <>
          <AdventureLobby adventure={adventure} adventurePlan={adventurePlan} invite={invite} hosted={hosted} />
          <Presence show={!isSignedIn && isLoaded} asChild>
            <div className="-mt-12 pb-24 relative z-10">
              <AccountRequired redirectUrl={redirectUrl} />
            </div>
          </Presence>
        </>
      )}
    </div>
  )
}

export default AdventureHomeContent
