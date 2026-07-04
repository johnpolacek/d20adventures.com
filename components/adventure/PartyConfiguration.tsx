"use client"

import { SignUpButton, useUser } from "@clerk/nextjs"
import { useParams } from "next/navigation"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { createAdventure } from "@/app/_actions/create-adventure"
import { Button } from "@/components/ui/button"
import { scrollToBottom } from "../ui/utils"
import type { CharacterChoiceMode } from "./character-selection"

interface PartyConfigurationProps {
  characterChoices: CharacterChoiceMode[]
  onModeChange: (characterId: string, mode: "player" | "invite" | "ai") => void
  characterNames: Record<string, string>
}

// Helper to check if this is a solo adventure (only one character total)
function isSoloAdventure(characterChoices: CharacterChoiceMode[]) {
  return characterChoices.length === 1
}

// Fixed, centered overlay so solo-adventure status is impossible to miss
// (the previous inline message sat at the bottom of the page and was easy to scroll past)
function StatusOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-primary-600 bg-gradient-to-br from-primary-900/95 via-primary-800/95 to-primary-900/95 p-8 text-center text-white shadow-2xl shadow-black/50 ring-4 ring-black/40">
        {children}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="mx-auto mb-4 h-10 w-10 animate-spin text-amber-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

const PartyConfiguration: React.FC<PartyConfigurationProps> = ({ characterChoices, characterNames }) => {
  const { settingId, adventurePlanId } = useParams()
  const { isLoaded, isSignedIn } = useUser()
  const [isCreating, setIsCreating] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const hasAutoStartedRef = useRef(false)

  // If only one character, auto-create and start adventure
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isSoloAdventure(characterChoices)) return
    if (hasAutoStartedRef.current || isCreating) return

    hasAutoStartedRef.current = true
    void startSelectedAdventure()
  }, [isLoaded, isSignedIn, characterChoices, isCreating])

  async function startSelectedAdventure() {
    if (isCreating) return
    setIsCreating(true)
    setStartError(null)

    try {
      await createAdventure({
        settingId: settingId as string,
        adventurePlanId: adventurePlanId as string,
        characterChoices,
      })
      // The redirect happens in the server action.
    } catch (error) {
      const isRedirectError = error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).includes("NEXT_REDIRECT")

      // A redirect is the success path: re-throw so Next performs the navigation.
      if (isRedirectError) throw error

      console.error("Failed to create adventure:", error)
      setStartError(error instanceof Error ? error.message : "Failed to start adventure.")
      setIsCreating(false)
    }
  }

  const handleStartAdventure = async () => {
    await startSelectedAdventure()
  }

  // Scroll to reveal the start controls for the multi-character button, but not
  // for solo adventures (status shows in a centered overlay) and not when signed
  // out (the sign-in prompt is a dialog) — scrolling would tuck the title under the fixed header
  useEffect(() => {
    if (isSignedIn && !isSoloAdventure(characterChoices)) {
      scrollToBottom()
    }
  }, [isSignedIn, characterChoices])

  // If only one character, show status in a centered overlay
  if (isSoloAdventure(characterChoices)) {
    if (!isLoaded) {
      return (
        <StatusOverlay>
          <Spinner />
          <div className="text-2xl font-display">Preparing your adventure...</div>
        </StatusOverlay>
      )
    }

    // Signed-out is handled by the sign-in dialog in character-selection.tsx;
    // rendering here too would stack a second overlay behind it.
    if (!isSignedIn) {
      return null
    }

    if (startError) {
      return (
        <StatusOverlay>
          <div className="text-2xl font-display mb-4 text-amber-300">Could not start your adventure</div>
          <div className="text-red-200 mb-6">{startError}</div>
          <Button variant="epic" size="lg" className="text-lg w-36" onClick={handleStartAdventure} disabled={isCreating}>
            Try Again
          </Button>
        </StatusOverlay>
      )
    }

    return (
      <StatusOverlay>
        <Spinner />
        <div className="text-2xl font-display mb-2">Starting your adventure...</div>
        <div className="text-white/80">Setting up your solo adventure. Please wait.</div>
      </StatusOverlay>
    )
  }

  return (
    <div className="p-4 sm:p-8 space-y-4 divide-y divide-white/20">
      {characterChoices.length > 1 &&
        characterChoices.map((choice) => (
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
