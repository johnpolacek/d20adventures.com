import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { startAdventure } from "@/app/_actions/start-adventure"
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

  if (!canStartAdventure) {
    return (
      <h3 className="font-display mb-6 text-2xl opacity-70 text-center">
        Waiting for more players...
        <div className="font-mono text-sm text-primary-200">
          ({currentPartySize}/{minParty} minimum)
        </div>
      </h3>
    )
  }

  if (partyIsFull) {
    return (
      <div className="space-y-4 text-center">
        <h3 className="font-display mb-4 text-2xl text-green-400">Party Complete!</h3>
        <p className="text-lg text-white/80 mb-6">All party slots filled. Ready to begin the adventure?</p>
        <Button variant="epic" size="lg" className="text-xl py-4 px-8" onClick={handleStartAdventure} disabled={isStarting}>
          {isStarting ? "Starting Adventure..." : "Start Adventure"}
        </Button>
      </div>
    )
  }

  // Party is not full, but minimum is met
  return (
    <div className="space-y-4 mb-12 text-center">
      <h3 className="font-display mb-4 text-2xl text-green-400">Ready to Start!</h3>
      <p className="text-white/80 mb-6">
        Minimum party size reached ({currentPartySize}/{maxParty}).
        <br />
        You can start now or wait for more players.
      </p>
      <Button variant="epic" size="lg" className="text-xl py-4 px-8" onClick={handleStartAdventure} disabled={isStarting}>
        {isStarting ? "Starting Adventure..." : "Start Adventure"}
      </Button>
    </div>
  )
}
