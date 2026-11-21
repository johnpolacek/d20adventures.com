import { Heading } from "@d20/ui/typography/heading"
import { useState } from "react"
import { startAdventure } from "@/app/_actions/start-adventure"
import { Button } from "@d20/ui/button"
import { Swap } from "@d20/ui/presence"
import type { Adventure } from "@/types/adventure"

interface StartAdventureButtonProps {
  canStartAdventure: boolean
  partyIsFull: boolean
  isSignedIn: boolean
  adventure: Adventure
  minParty: number
  maxParty: number
  currentPartySize: number
  settingId: string
  adventurePlanId: string
}

export function StartAdventureButton({ canStartAdventure, partyIsFull, isSignedIn, adventure, minParty, maxParty, currentPartySize, settingId, adventurePlanId }: StartAdventureButtonProps) {
  const [isStarting, setIsStarting] = useState(false)

  const handleStartAdventure = async () => {
    if (isStarting) return
    setIsStarting(true)
    await startAdventure({
      settingId,
      adventurePlanId,
      adventureId: adventure.id,
    })
    // The redirect happens in the server action
  }

  if (!isSignedIn) return null

  const state = !canStartAdventure ? "waiting" : partyIsFull ? "full" : "ready"

  return (
    <Swap id={state}>
      {state === "waiting" ? (
        <Heading variant="h2" as="h3" className="mb-6 opacity-70 text-center">
          Waiting for more players...
          <div className="font-mono text-sm text-primary-200">
            ({currentPartySize}/{minParty} minimum)
          </div>
        </Heading>
      ) : state === "full" ? (
        <div className="space-y-4 text-center">
          <Heading variant="h2" as="h3" className="mb-4 text-green-400">Party Complete!</Heading>
          <p className="text-lg text-white/80 mb-6">All party slots filled. Ready to begin the adventure?</p>
          <Button variant="epic" size="lg" className="text-xl py-4 px-8" onClick={handleStartAdventure} disabled={isStarting}>
            {isStarting ? "Starting Adventure..." : "Start Adventure"}
          </Button>
        </div>
      ) : (
        // Party is not full, but minimum is met
        <div className="space-y-4 mb-12 text-center">
          <Heading variant="h2" as="h3" className="mb-4 text-green-400">Ready to Start!</Heading>
          <p className="text-white/80 mb-6">
            Minimum party size reached ({currentPartySize}/{maxParty}).
            <br />
            You can start now or wait for more players.
          </p>
          <Button variant="epic" size="lg" className="text-xl py-4 px-8" onClick={handleStartAdventure} disabled={isStarting}>
            {isStarting ? "Starting Adventure..." : "Start Adventure"}
          </Button>
        </div>
      )}
    </Swap>
  )
}
