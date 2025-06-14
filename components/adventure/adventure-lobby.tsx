"use client"

import React, { useState, useEffect } from "react"
import { useUser, SignInButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { Adventure, TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PCTemplate } from "@/types/character"
import Image from "next/image"
import { getImageUrl } from "@/lib/utils"
import { Copy, Check, Share2, Bot } from "lucide-react"
import { toast } from "sonner"
import { useParams } from "next/navigation"
import { textShadow } from "../typography/styles"
import { joinAdventure } from "@/app/_actions/join-adventure"
import { startAdventure } from "@/app/_actions/start-adventure"
import { CharacterSheetModal } from "./character-sheet-modal"
import { scrollToTop } from "../ui/utils"

interface AdventureLobbyProps {
  adventure: Adventure
  adventurePlan?: AdventurePlan
}

// Convert PC to TurnCharacter format for the modal
function convertPCToTurnCharacter(pc: Adventure["party"][0]): TurnCharacter {
  return {
    ...pc,
    type: "pc" as const,
    initiative: 0, // Default value
    hasReplied: false,
    isComplete: false,
  }
}

// Convert PCTemplate to TurnCharacter format for the modal
function convertPCTemplateToTurnCharacter(pcTemplate: PCTemplate): TurnCharacter {
  return {
    ...pcTemplate,
    type: "pc" as const,
    userId: "", // Empty for template
    initiative: 0, // Default value
    hasReplied: false,
    isComplete: false,
  }
}

export default function AdventureLobby({ adventure, adventurePlan }: AdventureLobbyProps) {
  const { user, isSignedIn, isLoaded } = useUser()
  const params = useParams()
  const [isCopied, setIsCopied] = useState(false)
  const [assigningToAI, setAssigningToAI] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [modalCharacter, setModalCharacter] = useState<TurnCharacter | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const party = adventure.party
  const userCharacter = party?.find((pc) => pc.userId === user?.id)
  const availableCharacters = adventurePlan?.premadePlayerCharacters?.filter((pc) => !party?.some((partyMember) => partyMember.id === pc.id)) || []
  const aiCharacters: PCTemplate[] = [] // TODO: Get from adventure.aiCharacters
  const [minParty, maxParty] = adventurePlan?.party || [1, 4]
  const currentPartySize = party?.length || 0
  const canStartAdventure = currentPartySize >= minParty
  const partyIsFull = currentPartySize >= maxParty
  const shouldShowInvite = !partyIsFull && availableCharacters.length > 0

  console.log(
    "[AdventureLobby] party info",
    JSON.stringify(
      {
        minParty,
        maxParty,
        currentPartySize,
        canStartAdventure,
        partyIsFull,
        shouldShowInvite,
      },
      null,
      2
    )
  )

  // Debug: Log the raw adventure prop
  console.log("[AdventureLobby] adventure prop:", JSON.stringify(adventure, null, 2))
  // Debug: Log the players array
  console.log("[AdventureLobby] adv.players:", JSON.stringify(adventure.players, null, 2))
  // Debug: Log the computed party array
  console.log("[AdventureLobby] computed party:", JSON.stringify(party, null, 2))
  // Debug: Log the userCharacter
  console.log("[AdventureLobby] userCharacter:", JSON.stringify(userCharacter, null, 2))

  useEffect(() => {
    if (isLoaded) {
      scrollToTop()
    }
  }, [isLoaded])

  // Generate the invite link
  const inviteLink = typeof window !== "undefined" ? `${window.location.origin}/settings/${params.settingId}/${params.adventurePlanId}/${adventure.id}` : ""

  // Generate the redirect URL for after sign up/sign in
  const redirectUrl =
    typeof window !== "undefined" ? window.location.href : `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings/${params.settingId}/${params.adventurePlanId}/${adventure.id}`

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setIsCopied(true)
      toast.success("Invite link copied to clipboard!")
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      toast.error("Failed to copy link")
      console.error("Copy failed:", error)
    }
  }

  const handleAssignToAI = async (characterId: string) => {
    setAssigningToAI(characterId)
    try {
      // TODO: Implement assignCharacterToAI server action
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Placeholder delay
      toast.success("Character assigned to AI!")
    } catch {
      toast.error("Failed to assign character to AI")
    } finally {
      setAssigningToAI(null)
    }
  }

  const handleJoinAdventure = async (characterId: string) => {
    if (isJoining) return

    setIsJoining(true)
    await joinAdventure({
      settingId: params.settingId as string,
      adventurePlanId: params.adventurePlanId as string,
      adventureId: adventure.id,
      characterId,
    })
    // The redirect happens in the server action
    // Note: redirect() throws NEXT_REDIRECT which is expected behavior, not an error
  }

  const handleStartAdventure = async () => {
    if (isStarting) return

    setIsStarting(true)
    await startAdventure({
      settingId: params.settingId as string,
      adventurePlanId: params.adventurePlanId as string,
      adventureId: adventure.id,
    })
    // The redirect happens in the server action
    // Note: redirect() throws NEXT_REDIRECT which is expected behavior, not an error
  }

  const handleViewCharacterSheet = (character: Adventure["party"][0]) => {
    const turnCharacter = convertPCToTurnCharacter(character)
    setModalCharacter(turnCharacter)
    setIsModalOpen(true)
  }

  const handleViewAvailableCharacterSheet = (character: PCTemplate) => {
    const turnCharacter = convertPCTemplateToTurnCharacter(character)
    setModalCharacter(turnCharacter)
    setIsModalOpen(true)
  }

  // Show different UI based on user state
  if (isSignedIn && userCharacter) {
    // User is signed in and has a character - show waiting state
    return (
      <div className="w-full flex flex-col items-center justify-center max-w-5xl fade-in relative z-10 pb-16 -mt-16">
        <div className="absolute -top-4 left-0 w-full flex justify-center z-10 text-xl text-center font-display font-bold">
          <div className="text-sm bg-primary-700 px-4 py-1 ring-[6px] ring-primary-800 rounded border border-white/20 font-display text-amber-300">Your Character</div>
        </div>
        <div
          id="your-character"
          className="relative bg-black/50 rounded-lg overflow-hidden border border-white/30 ring-8 ring-black/50 w-80 cursor-pointer hover:ring-primary-500 transition-all duration-300 hover:scale-[1.01]"
          onClick={() => handleViewCharacterSheet(userCharacter)}
        >
          <div className="relative w-full h-full aspect-square">
            <Image className="w-full h-full object-cover" fill src={userCharacter.image ? getImageUrl(userCharacter.image) : "/images/placeholder.svg"} alt={userCharacter.name} />
          </div>
          <div className="text-white absolute bottom-0 left-0 right-0 w-full z-10 text-center">
            <div className="font-display font-bold text-2xl mb-1">{userCharacter.name}</div>
            <div className="text-xs font-medium bg-black/80 px-2 py-1 rounded border border-white/30 inline-block mb-3">View Character Sheet</div>
          </div>
          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent h-1/2" />
        </div>

        <div className="pt-12 mb-4 text-center flex flex-col items-center">
          {adventurePlan?.teaser && (
            <div className="pb-16 max-w-2xl mx-auto">
              <p>{adventurePlan?.teaser}</p>
            </div>
          )}

          {/* Show different messages based on party state */}
          {!canStartAdventure ? (
            <h3 className="font-display mb-6 text-2xl opacity-70">
              Waiting for more players...
              <div className="font-mono text-sm text-primary-200">
                ({currentPartySize}/{minParty} minimum)
              </div>
            </h3>
          ) : partyIsFull ? (
            <div className="space-y-4">
              <h3 className="font-display mb-4 text-2xl text-green-400">Party Complete!</h3>
              <p className="text-lg text-white/80 mb-6">All party slots filled. Ready to begin the adventure?</p>
              <Button variant="epic" size="lg" className="text-xl py-4 px-8" onClick={handleStartAdventure} disabled={isStarting}>
                {isStarting ? "Starting Adventure..." : "Start Adventure"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mb-12">
              <h3 className="font-display mb-4 text-2xl text-green-400">Ready to Start!</h3>
              <p className="text-lg text-white/80 mb-6">
                Minimum party size reached ({currentPartySize}/{maxParty}). You can start now or wait for more players.
              </p>
              <Button variant="epic" size="lg" className="text-xl py-4 px-8" onClick={handleStartAdventure} disabled={isStarting}>
                {isStarting ? "Starting Adventure..." : "Start Adventure"}
              </Button>
            </div>
          )}

          {/* Invite Link - only show if party isn't full */}
          {shouldShowInvite && (
            <div className="mb-6 border border-white/30 bg-primary-800/70 rounded-lg pt-2 pb-6 px-4">
              <p className="text-sm text-amber-400 pt-3 pb-2 font-display text-xl">Invite Players</p>
              <div className="flex items-center gap-2 bg-black rounded-lg p-3 max-w-md mx-auto">
                <Share2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <code className="flex-1 text-xs text-gray-300 truncate">{inviteLink}</code>
                <Button size="sm" variant="outline" onClick={handleCopyInvite} className="flex-shrink-0 h-7 px-2">
                  {isCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          )}

          {/* Available Characters - only show if party isn't full */}
          {shouldShowInvite && (
            <div className="space-y-3 w-full max-w-lg mx-auto">
              <p className="text-sm text-white/70 mt-4 mb-2">Available characters:</p>
              {availableCharacters.map((char) => (
                <div key={char.id} className="w-full flex items-center justify-between bg-black/30 rounded-lg p-3 border border-white/20">
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-colors duration-500 ease-in-out rounded p-1 -m-1"
                    onClick={() => handleViewAvailableCharacterSheet(char)}
                  >
                    <div>
                      <p className="text-base font-display text-white pr-8">{char.name}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAssignToAI(char.id)} disabled={assigningToAI === char.id} className="flex items-center gap-2 text-sm">
                    <Bot className="w-4 h-4" />
                    {assigningToAI === char.id ? "Assigning..." : "Assign to AI"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* AI-Controlled Characters */}
          {aiCharacters.length > 0 && (
            <div className="space-y-3 mt-6">
              <p className="text-sm text-gray-500 mb-4">AI-controlled characters:</p>
              {aiCharacters.map((char) => (
                <div key={char.id} className="flex items-center justify-between bg-blue-900/20 rounded-lg p-3 border border-blue-500/30">
                  <div className="flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors duration-200 rounded p-1 -m-1" onClick={() => handleViewAvailableCharacterSheet(char)}>
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700">
                      <Image className="w-full h-full object-cover" fill src={char.image ? getImageUrl(char.image) : "/images/placeholder.svg"} alt={char.name} width={40} height={40} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{char.name}</p>
                      <p className="text-xs text-blue-300 flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        AI-controlled • Click to view details
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Character Sheet Modal */}
        <CharacterSheetModal character={modalCharacter} open={isModalOpen} onOpenChange={setIsModalOpen} />
      </div>
    )
  }

  if (!isSignedIn && availableCharacters.length > 0) {
    // User is not signed in and there are available characters
    const firstAvailable = availableCharacters[0]
    return (
      <div id="join-adventure" className="grow max-w-2xl fade-in relative z-10 -mt-16 pb-12">
        {adventurePlan?.teaser && (
          <div className="pb-8">
            <p style={textShadow}>{adventurePlan?.teaser}</p>
          </div>
        )}
        <Card className="bg-black/50 border-amber-300/30 ring-8 ring-black/30 max-w-md mx-auto">
          <CardContent className="p-6 text-center flex flex-col items-center gap-2">
            <h2 className="text-3xl text-amber-300 font-display mb-4">Join the Adventure</h2>
            <p className="mb-2 text-white/90">
              You can play as <span className="text-white text-xl">{firstAvailable.name}</span>
            </p>

            <div
              id="join-adventure-character"
              className="relative bg-black/50 rounded-lg overflow-hidden border border-white/30 ring-8 ring-black/50 w-80 cursor-pointer hover:ring-primary-500 transition-all duration-300 hover:scale-[1.01]"
              onClick={() => handleViewAvailableCharacterSheet(firstAvailable)}
            >
              <div className="relative w-full h-full aspect-square">
                <Image className="w-full h-full object-cover" fill src={firstAvailable.image ? getImageUrl(firstAvailable.image) : "/images/placeholder.svg"} alt={firstAvailable.name} />
              </div>
              <div className="text-white absolute bottom-0 left-0 right-0 w-full z-10 text-center">
                <div className="font-display font-bold text-2xl mb-1">{firstAvailable.name}</div>
                <div className="text-xs font-medium bg-black/80 px-2 py-1 rounded border border-white/30 inline-block mb-3">View Character Sheet</div>
              </div>
              <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent h-1/2" />
            </div>

            <p className="text-gray-300 mb-6 text-sm">Sign up to claim this character and join the adventure.</p>

            <SignInButton mode="modal" fallbackRedirectUrl={redirectUrl}>
              <Button variant="epic" size="lg" className="text-xl py-4 px-8">
                Sign Up to Play
              </Button>
            </SignInButton>

            {availableCharacters.length > 1 && (
              <div className="mt-6 bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Other Available Characters:</h3>
                <div className="space-y-1">
                  {availableCharacters.slice(1).map((char) => (
                    <p key={char.id} className="text-sm text-gray-400">
                      {char.name} - <span className="text-green-300">Open</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Character Sheet Modal */}
        <CharacterSheetModal character={modalCharacter} open={isModalOpen} onOpenChange={setIsModalOpen} />
      </div>
    )
  }

  if (isSignedIn && !userCharacter && availableCharacters.length > 0) {
    // User is signed in but doesn't have a character yet - let them join
    const firstAvailable = availableCharacters[0]
    return (
      <div id="join-adventure" className="grow max-w-2xl fade-in relative z-10 -mt-16 pb-12">
        {adventurePlan?.teaser && (
          <div className="pb-8">
            <p style={textShadow}>{adventurePlan?.teaser}</p>
          </div>
        )}
        <Card className="bg-black/50 border-amber-300/30 ring-8 ring-black/30 max-w-md mx-auto">
          <CardContent className="p-6 text-center flex flex-col items-center gap-2">
            <h2 className="text-3xl text-amber-300 font-display mb-4">Join the Adventure</h2>
            <p className="mb-2 text-white/80">
              You can play as <span className="text-white">{firstAvailable.name}</span>
            </p>

            <div
              className="relative bg-black/50 rounded-lg overflow-hidden border border-white/30 ring-8 ring-black/50 w-80 cursor-pointer hover:ring-primary-500 transition-all duration-300 hover:scale-[1.01]"
              onClick={() => handleViewAvailableCharacterSheet(firstAvailable)}
            >
              <div className="relative w-full h-full aspect-square">
                <Image className="w-full h-full object-cover" fill src={firstAvailable.image ? getImageUrl(firstAvailable.image) : "/images/placeholder.svg"} alt={firstAvailable.name} />
              </div>
              <div className="text-white absolute bottom-0 left-0 right-0 w-full z-10 text-center">
                <div className="font-display font-bold text-2xl mb-1">{firstAvailable.name}</div>
                <div className="text-xs font-medium bg-black/80 px-2 py-1 rounded border border-white/30 inline-block mb-3">View Character Sheet</div>
              </div>
              <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent h-1/2" />
            </div>

            <Button variant="epic" size="lg" className="text-xl py-4 px-8 mt-4" onClick={() => handleJoinAdventure(firstAvailable.id)} disabled={isJoining}>
              {isJoining ? "Joining..." : `Join Game`}
            </Button>

            {availableCharacters.length > 1 && (
              <div className="mt-6 bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Other Available Characters:</h3>
                <div className="space-y-1">
                  {availableCharacters.slice(1).map((char) => (
                    <p key={char.id} className="text-sm text-gray-400">
                      {char.name} - <span className="text-green-300">Open</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Character Sheet Modal */}
        <CharacterSheetModal character={modalCharacter} open={isModalOpen} onOpenChange={setIsModalOpen} />
      </div>
    )
  }

  // Fallback: show basic waiting message
  return (
    <div className="grow max-w-2xl fade-in">
      <Card className="bg-black/50 border-gray-500/50">
        <CardContent className="p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-400 mb-4">Adventure Lobby</h2>
          <p className="text-gray-300 mb-6">{adventure.status === "waitingForPlayers" ? "Waiting for players to join..." : "Adventure is ready to begin!"}</p>
        </CardContent>
      </Card>
    </div>
  )
}
