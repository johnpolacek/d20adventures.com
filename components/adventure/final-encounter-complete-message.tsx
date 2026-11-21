"use client"

import { Heading } from "@d20/ui/typography/heading"
import Link from "next/link"
import React from "react"
import { getAdventurePlan } from "@/app/_actions/get-adventure-plan"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { Swap } from "@d20/ui/presence"
import { getImageUrl } from "@/lib/utils"
import type { AdventurePlan } from "@/types/adventure-plan"

interface FinalEncounterCompleteMessageProps {
  isSignedIn: boolean
  settingId: string
  adventurePlanId: string
  nextAdventure?: string | null
}

const FinalEncounterCompleteMessage = ({ isSignedIn, settingId, adventurePlanId, nextAdventure }: FinalEncounterCompleteMessageProps) => {
  const [nextAdventurePlan, setNextAdventurePlan] = React.useState<AdventurePlan | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  React.useEffect(() => {
    if (nextAdventure && isSignedIn) {
      setIsLoading(true)
      getAdventurePlan(settingId, nextAdventure)
        .then((plan) => {
          setNextAdventurePlan(plan)
        })
        .catch((error) => {
          console.error("Error loading next adventure plan:", error)
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [nextAdventure, settingId, isSignedIn])

  return (
    <>
      <p className="text-primary-300 text-lg xl:text-xl font-display font-bold mb-4 max-w-md mx-auto">Congratulations, you&apos;ve made it to the end of this adventure!</p>
      {isSignedIn && nextAdventure && (
        <Swap id={isLoading ? "loading" : nextAdventurePlan ? "plan" : "link"} className="space-y-4">
          {isLoading ? (
            <div className="text-center">
              <p className="text-primary-200">Loading next adventure...</p>
            </div>
          ) : nextAdventurePlan ? (
            <div className="max-w-md mx-auto border-primary-800 bg-gradient-to-b from-primary-900/50 to-primary-800/30">
              <div className="p-6">
                <div className="space-y-4">
                  {/* Adventure Image */}
                  {nextAdventurePlan.image && (
                    <div className="relative h-32 w-full rounded-lg overflow-hidden">
                      <Image src={getImageUrl(nextAdventurePlan.image)} alt={nextAdventurePlan.title} fill className="object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>
                  )}
                  {/* Adventure Details */}
                  <div className="space-y-2">
                    <Heading variant="h3">{nextAdventurePlan.title}</Heading>
                    {nextAdventurePlan.teaser && <p className="text-sm text-white leading-relaxed pb-2">{nextAdventurePlan.teaser}</p>}
                  </div>
                  {/* Play Button */}
                  <Button size="lg" variant="epic" render={<Link href={`/settings/${settingId}/${nextAdventure}/character-select`} />}>Play Next Adventure</Button>
                </div>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="epic" render={<Link href={`/settings/${settingId}/${nextAdventure}/character-select`} />}>Play Next Adventure</Button>
          )}
        </Swap>
      )}
      {isSignedIn && !nextAdventure && (
        <div className="flex flex-col md:flex-row justify-center gap-6">
          <Button size="sm" variant="epic" render={<Link href={`/settings/${settingId}/${adventurePlanId}/character-select`} />}>Play Again</Button>
          <Button size="sm" variant="epic" className="bg-accent-800 hover:bg-accent-700 saturate-75" render={<Link href={`/settings/${settingId}/play`} />}>Go to Setting</Button>
        </div>
      )}
    </>
  )
}

export default FinalEncounterCompleteMessage
