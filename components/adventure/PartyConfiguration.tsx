"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { CharacterChoiceMode } from "./character-selection"
import { useParams } from "next/navigation"
import { scrollToBottom } from "../ui/utils"
import { useUser, SignUpButton } from "@clerk/nextjs"
import { createAdventure } from "@/app/_actions/create-adventure"

interface PartyConfigurationProps {
  characterChoices: CharacterChoiceMode[]
  onModeChange: (characterId: string, mode: "player" | "invite" | "ai") => void
  characterNames: Record<string, string>
}

const PartyConfiguration: React.FC<PartyConfigurationProps> = ({ characterChoices, characterNames }) => {
  const { settingId, adventurePlanId } = useParams()
  const { isSignedIn } = useUser()
  const [isCreating, setIsCreating] = useState(false)

  const handleStartAdventure = async () => {
    if (isCreating) return

    setIsCreating(true)
    try {
      await createAdventure({
        settingId: settingId as string,
        adventurePlanId: adventurePlanId as string,
        characterChoices,
      })
      // The redirect happens in the server action
    } catch (error) {
      console.error("Failed to create adventure:", error)
      setIsCreating(false)
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [])

  return (
    <div className="bg-black/50 rounded-lg p-4 sm:p-8 space-y-4 divide-y divide-white/20">
      {characterChoices.map((choice) => (
        <div key={choice.characterId} className="character-choice flex justify-between items-center w-full pb-4">
          <span className="font-display text-xl font-semibold relative top-1">{characterNames[choice.characterId]}</span>
          <div className="mode-buttons flex items-center space-x-8">
            {choice.mode === "player" ? <Button variant="epic">Player</Button> : <div className="text-green-300 bg-green-200/10 px-12 mr-2 py-1 border border-green-300 rounded font-mono">Open</div>}
          </div>
        </div>
      ))}

      <div className="text-center py-4">
        {isSignedIn ? (
          <Button variant="epic" size="lg" className="text-2xl py-6 px-12" onClick={handleStartAdventure} disabled={isCreating}>
            {isCreating ? "Creating Adventure..." : "Start Adventure"}
          </Button>
        ) : (
          <SignUpButton mode="modal">
            <Button variant="epic" size="lg" className="text-2xl py-6 px-12">
              Sign Up
            </Button>
          </SignUpButton>
        )}
      </div>
    </div>
  )
}

export default PartyConfiguration
