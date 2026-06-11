"use client"

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import slugify from "slugify"
import { joinAdventure } from "@/app/_actions/join-adventure"
import { Button } from "@/components/ui/button"
import { CharacterSelectCard } from "@/components/ui/character-select-card"
import type { Adventure } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PC, PCTemplate } from "@/types/character"
import { scrollToTop } from "../ui/utils"
import { CharacterSheetModal } from "./character-sheet-modal"
import GameChat from "./game-chat"
import { InviteLink } from "./invite-link"
import { PartyLobbyGrid } from "./party-lobby-grid"
import { StartAdventureButton } from "./start-adventure-button"

interface AdventureLobbyProps {
  adventure: Adventure
  adventurePlan?: AdventurePlan
}

// Waiting room of an existing adventure, before it begins
export default function AdventureLobby({ adventure: initialAdventure, adventurePlan }: AdventureLobbyProps) {
  const { user, isSignedIn, isLoaded } = useUser()
  const params = useParams()
  const [isJoining, setIsJoining] = useState(false)
  const [joiningCharacterId, setJoiningCharacterId] = useState<string | null>(null)
  const [modalCharacter, setModalCharacter] = useState<PC | PCTemplate | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [adventure, setAdventure] = useState(initialAdventure)
  const [userCharacters, setUserCharacters] = useState<PCTemplate[]>([])
  const [isLoadingUserChars, setIsLoadingUserChars] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})
  const hasFetchedUserChars = useRef(false)

  // Polling for adventure updates (only when signed in)
  useEffect(() => {
    if (!isSignedIn) return

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/adventure/${params.adventureId}`)
        if (response.ok) {
          const updatedAdventure = await response.json()
          setAdventure(updatedAdventure)
        }
      } catch (error) {
        console.error("Failed to poll adventure updates:", error)
      }
    }, 3000) // Poll every 3 seconds

    return () => clearInterval(pollInterval)
  }, [params.adventureId, isSignedIn])

  useEffect(() => {
    if (isLoaded) {
      scrollToTop()
    }
  }, [isLoaded])

  useEffect(() => {
    const party = adventure.party
    const userCharacter = party?.find((pc) => pc.userId === user?.id)

    if (isSignedIn && !userCharacter && !hasFetchedUserChars.current) {
      hasFetchedUserChars.current = true
      setIsLoadingUserChars(true)
      fetch(`/api/user-characters?userId=${user?.id}`)
        .then((res) => res.json())
        .then(setUserCharacters)
        .finally(() => setIsLoadingUserChars(false))
    }
  }, [isSignedIn, user?.id])

  // Fetch player names for characters in the party
  useEffect(() => {
    if (!isSignedIn) return

    const party = adventure.party || []
    const userIds = party.map((pc) => pc.userId).filter(Boolean)

    if (userIds.length > 0) {
      fetch("/api/users/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: userIds }),
      })
        .then((res) => res.json())
        .then((data) => setPlayerNames(data.users || {}))
        .catch((err) => console.error("Failed to fetch player names:", err))
    }
  }, [adventure.party, isSignedIn])

  const handleJoinAdventure = async (characterId: string) => {
    if (isJoining) return

    setJoiningCharacterId(characterId)
    setIsJoining(true)
    setJoinError(null)

    try {
      await joinAdventure({
        settingId: params.settingId as string,
        adventurePlanId: params.adventurePlanId as string,
        adventureId: adventure.id,
        characterId,
      })
      // The redirect happens in the server action
      // Note: redirect() throws NEXT_REDIRECT which is expected behavior, not an error
    } catch (error) {
      // Don't reset state for redirect errors - let the redirect complete
      const isRedirectError = error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).includes("NEXT_REDIRECT")
      if (isRedirectError) return

      console.error("Failed to join adventure:", error)
      setJoinError(error instanceof Error ? error.message : "Failed to join adventure")
      setIsJoining(false)
      setJoiningCharacterId(null)
    }
  }

  // Add a handler for clicking a character slot to open the modal
  const handlePartySlotClick = (character: PC | PCTemplate) => {
    setModalCharacter(character)
    setIsModalOpen(true)
  }

  if (!isLoaded) {
    return null
  }

  const party = adventure.party
  const userCharacter = party?.find((pc) => pc.userId === user?.id)
  const availableCharacters = adventurePlan?.premadePlayerCharacters?.filter((pc) => !party?.some((partyMember) => partyMember.id === pc.id)) || []

  // Always show the party grid and teaser, even if not signed in
  const showTeaser = adventurePlan?.teaser
  // Generate the invite link for the lobby
  const inviteLink = typeof window !== "undefined" ? `${window.location.origin}/settings/${params.settingId}/${params.adventurePlanId}/${adventure.id}` : ""
  // Calculate min and max party size
  const minParty = adventurePlan?.party?.[0] || 1
  const maxParty = adventurePlan?.party?.[1] || 4
  const currentPartySize = party?.length || 0
  const canStartAdventure = currentPartySize >= minParty
  const partyIsFull = currentPartySize >= maxParty
  const hasEmptySlots = (party?.length || 0) < maxParty

  return (
    <>
      <CharacterSheetModal
        character={modalCharacter}
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open)
          if (!open) setModalCharacter(null)
        }}
      />
      <div className="w-full flex flex-col items-center justify-center max-w-6xl fade-in relative z-10 pb-16 -mt-16">
        <PartyLobbyGrid
          adventure={adventure}
          adventurePlan={adventurePlan!}
          userId={user?.id}
          onCharacterClick={handlePartySlotClick}
          availableCharacters={availableCharacters}
          onJoinClick={isSignedIn ? handleJoinAdventure : undefined}
          isJoining={isJoining}
          playerNames={playerNames}
        />
        {showTeaser && (
          <div className="italic opacity-90 text-center flex flex-col items-center">
            <div className="pb-8 max-w-4xl mx-auto text-left text-pretty">
              <p>{adventurePlan?.teaser}</p>
            </div>
          </div>
        )}
        {/* Start Adventure Button for signed-in users with a character */}
        {isSignedIn && userCharacter && (
          <StartAdventureButton
            canStartAdventure={canStartAdventure}
            partyIsFull={partyIsFull}
            isSignedIn={isSignedIn}
            adventure={adventure}
            minParty={minParty}
            maxParty={maxParty}
            currentPartySize={currentPartySize}
            settingId={params.settingId as string}
            adventurePlanId={params.adventurePlanId as string}
          />
        )}
        {/* Only show join controls if signed in and no user character */}
        {isSignedIn && !userCharacter && (
          <div className="w-full flex flex-col items-center justify-center mb-8">
            {isLoadingUserChars ? (
              <div className="text-center text-white/80 py-8 opacity-0">Loading your characters...</div>
            ) : (
              <>
                {joinError && !/redirect/i.test(joinError) && <div className="text-center text-red-400 text-sm mb-4 bg-red-900/20 px-4 py-2 rounded">{joinError}</div>}
                {userCharacters.length > 0 && (
                  <>
                    <h2 className="text-2xl font-display text-amber-400 mb-6">Join with Your Character</h2>
                    <div className="w-full flex flex-wrap gap-6 justify-center mb-8">
                      {userCharacters.map((char) => {
                        const charJoinId = `characters/${user?.id}/${slugify(char.name, { lower: true, strict: true })}.json`
                        return (
                          <div key={char.id} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
                            <CharacterSelectCard
                              className="ring-white/20"
                              character={char}
                              buttonLabel={isJoining && joiningCharacterId === charJoinId ? "Joining..." : "Join"}
                              disabled={isJoining}
                              onButtonClick={() => handleJoinAdventure(charJoinId)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                <Link href={`/player/${user?.username}/characters/new?redirectToAdventure=${encodeURIComponent(window.location.pathname)}`}>
                  <Button variant="epic" size="lg" className="mb-4">
                    Create New Character
                  </Button>
                </Link>
                {availableCharacters.length > 0 && (
                  <>
                    <h3 className="text-lg font-display text-amber-400 my-8 w-full text-center">Or join with a premade character:</h3>
                    <div className="w-full flex flex-wrap gap-6 justify-center mb-8">
                      {availableCharacters.map((char) => (
                        <div key={char.id} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
                          <CharacterSelectCard
                            className="ring-white/20"
                            character={char}
                            buttonLabel={isJoining && joiningCharacterId === char.id ? "Joining..." : "Join"}
                            disabled={isJoining}
                            onButtonClick={() => handleJoinAdventure(char.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {isSignedIn && userCharacter && hasEmptySlots && <InviteLink inviteLink={inviteLink} />}
        {isSignedIn && userCharacter && (
          <div className="fixed top-20 right-8 z-50">
            <GameChat />
          </div>
        )}
      </div>
    </>
  )
}
