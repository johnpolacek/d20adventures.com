"use client"

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import slugify from "slugify"
import { joinAdventure, requestSeat } from "@/app/_actions/join-adventure"
import { Button } from "@/components/ui/button"
import type { Id } from "@/convex/_generated/dataModel"
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

// A hosted game's seats for guests when the page loaded: the held heroes still open, the seat this guest's link
// names ("any" for a hero of their own), how many seats take a guest's own hero, whether the host approves this
// guest's hero, whether the host removed this guest, how many held seats are kept for a host who plays the hero
// their guests leave, and this guest's request with the host's answer.
type SeatRequest = { name: string; status: "pending" | "rejected" | "removed"; note?: string }
type OpenSeats = { open: number; approve: boolean; removed: boolean; keep?: number; request?: SeatRequest }
export type LobbyInvite = OpenSeats & { seats: PCTemplate[]; as?: string }

interface AdventureLobbyProps {
  adventure: Adventure
  adventurePlan?: AdventurePlan
  invite?: LobbyInvite
  // The GM runs in the host's app, so only the host starts the game.
  hosted?: boolean
}

// Waiting room of an existing adventure, before it begins
export default function AdventureLobby({ adventure: initialAdventure, adventurePlan, invite, hosted }: AdventureLobbyProps) {
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
  // The open seats and this guest's request, kept current by the poll below.
  const [seat, setSeat] = useState<OpenSeats>({ open: invite?.open ?? 0, approve: invite?.approve ?? false, removed: invite?.removed ?? false, keep: invite?.keep, request: invite?.request })
  const [askingId, setAskingId] = useState<string | null>(null)
  const [changingHero, setChangingHero] = useState(false)

  // Polling for adventure updates (only when signed in)
  useEffect(() => {
    if (!isSignedIn) return

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/adventure/${params.adventureId}`)
        if (response.ok) {
          const updatedAdventure = await response.json()
          setAdventure(updatedAdventure)
          if (updatedAdventure.seat) setSeat(updatedAdventure.seat)
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
    const userCharacter = party?.find((pc) => pc.userId === user?.id && pc.controlledBy !== "ai")

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

  // Takes an open seat with one of the guest's own heroes, or asks the host for it where the host approves heroes.
  const handleAskForSeat = async (characterId: string, name: string) => {
    if (askingId) return
    setAskingId(characterId)
    setJoinError(null)
    const { seated, error }: { seated?: boolean; error?: string } = await requestSeat({ adventureId: adventure.id, characterId }).catch(() => ({ error: "That seat could not be taken." }))
    // Seated at once: load again as a player.
    if (seated) return window.location.replace(window.location.pathname)
    if (error) setJoinError(error)
    else {
      setSeat((s) => ({ ...s, request: { name, status: "pending" } }))
      setChangingHero(false)
    }
    setAskingId(null)
  }

  // Seated by the host's approval while this page was open. It loaded for a guest, without the turn stream, so it
  // loads again as a player.
  const mine = (pc: PC) => pc.userId === user?.id && pc.controlledBy !== "ai"
  const seatedSinceLoad = Boolean(user?.id && adventure.party?.some(mine) && !initialAdventure.party?.some(mine))
  // Removed by the host while this page was open: it loads again as a guest.
  const removedSinceLoad = Boolean(user?.id && seat.request?.status === "removed" && initialAdventure.party?.some(mine) && !adventure.party?.some(mine))
  useEffect(() => {
    if (invite && (seatedSinceLoad || removedSinceLoad)) window.location.replace(window.location.pathname)
  }, [invite, seatedSinceLoad, removedSinceLoad])

  // Add a handler for clicking a character slot to open the modal
  const handlePartySlotClick = (character: PC | PCTemplate) => {
    setModalCharacter(character)
    setIsModalOpen(true)
  }

  const [companionBusyId, setCompanionBusyId] = useState<string | null>(null)
  const [showAiCompanions, setShowAiCompanions] = useState(false)

  const handleAddAiCompanion = async (characterId: string) => {
    if (companionBusyId) return
    setCompanionBusyId(characterId)
    setJoinError(null)
    try {
      const { addAiCompanionAction } = await import("@/app/_actions/manage-ai-companions")
      await addAiCompanionAction({ adventureId: adventure.id as Id<"adventures">, characterId })
      const response = await fetch(`/api/adventure/${params.adventureId}`)
      if (response.ok) setAdventure(await response.json())
    } catch (error) {
      console.error("Failed to add AI companion:", error)
      setJoinError(error instanceof Error ? error.message : "Failed to add AI companion")
    } finally {
      setCompanionBusyId(null)
    }
  }

  const handleRemoveAiCompanion = async (characterId: string) => {
    if (companionBusyId) return
    setCompanionBusyId(characterId)
    setJoinError(null)
    try {
      const { removeAiCompanionAction } = await import("@/app/_actions/manage-ai-companions")
      await removeAiCompanionAction({ adventureId: adventure.id as Id<"adventures">, characterId })
      const response = await fetch(`/api/adventure/${params.adventureId}`)
      if (response.ok) setAdventure(await response.json())
    } catch (error) {
      console.error("Failed to remove AI companion:", error)
      setJoinError(error instanceof Error ? error.message : "Failed to remove AI companion")
    } finally {
      setCompanionBusyId(null)
    }
  }

  if (!isLoaded) {
    return null
  }

  const party = adventure.party
  const userCharacter = party?.find((pc) => pc.userId === user?.id && pc.controlledBy !== "ai")
  const notSeated = (pc: PCTemplate) => !party?.some((partyMember) => partyMember.id === pc.id)
  // In a game with seats for guests, a guest takes a held hero (the one their link names, or any still open) or
  // asks the host for an open seat with a hero of their own.
  const unseated = invite?.seats.filter(notSeated) ?? []
  const openSeats = unseated.length > (seat.keep ?? 0) ? unseated : []
  const hostSeat = seat.keep ? { hero: unseated.length === 1 ? unseated[0] : undefined } : undefined
  const namedSeat = openSeats.find((pc) => pc.id === invite?.as)
  // A guest the host removed takes no held seat. They may ask for an open one.
  const heldSeats = seat.removed || (invite?.as === "any" && seat.open > 0) ? [] : namedSeat ? [namedSeat] : openSeats
  const availableCharacters = invite ? heldSeats : adventurePlan?.premadePlayerCharacters?.filter(notSeated) || []
  const waitingOnHost = seat.request?.status === "pending" && !changingHero
  // Join seats a guest's own hero at once. Ask to join waits for the host.
  const ownHeroLabel = (id: string) => {
    const busy = invite ? askingId === id : isJoining && joiningCharacterId === id
    return invite && seat.approve ? (busy ? "Asking..." : "Ask to join") : busy ? "Joining..." : "Join"
  }
  const bringOwn = Boolean(invite) && seat.open > 0 && (!namedSeat || seat.removed) && !waitingOnHost
  // Over the heroes a guest may take directly, which follow their own heroes when both are offered.
  const takeHero = availableCharacters.length === 1 ? `Play as ${availableCharacters[0].name}` : "Choose your hero"
  const takeHeading = !invite ? "Or join with a premade character:" : bringOwn ? `Or ${takeHero.charAt(0).toLowerCase()}${takeHero.slice(1)}` : takeHero
  const isOwner = user?.id === adventure.ownerId
  // In a hosted game the host invites and starts, from their app.
  const guestOfHost = Boolean(hosted && !isOwner)

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
          seats={invite ? (party?.length ?? 0) + unseated.length + seat.open : undefined}
          hostSeat={hostSeat}
          onJoinClick={isSignedIn ? handleJoinAdventure : undefined}
          onRemoveAiCompanion={isOwner ? handleRemoveAiCompanion : undefined}
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
        {isSignedIn && userCharacter && guestOfHost && <h3 className="font-display mb-6 text-2xl opacity-70 text-center">Waiting for the host to start...</h3>}
        {isSignedIn && userCharacter && !guestOfHost && (
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
                {invite && availableCharacters.length === 0 && seat.open < 1 && !seat.removed && <p className="text-center text-white/80">Every seat at this table is taken.</p>}
                {waitingOnHost && seat.open > 0 && (
                  <div className="mb-8 flex flex-col items-center gap-4 text-center">
                    <p className="text-white/80">Waiting for the host to approve {seat.request?.name}.</p>
                    <Button variant="outline" size="sm" onClick={() => setChangingHero(true)}>
                      Choose another hero
                    </Button>
                  </div>
                )}
                {seat.request && seat.request.status !== "pending" && (
                  <p className="mb-8 max-w-xl rounded bg-amber-900/20 px-4 py-2 text-center text-amber-200">
                    The host {seat.request.status === "removed" ? "removed" : "declined"} {seat.request.name}
                    {seat.request.note ? `: ${seat.request.note}` : "."}
                  </p>
                )}
                {(!invite || bringOwn) && userCharacters.length > 0 && (
                  <>
                    <h2 className="text-2xl font-display text-amber-400 mb-6">{invite ? "Bring your own hero" : "Join with Your Character"}</h2>
                    <div className="w-full flex flex-wrap gap-6 justify-center mb-8">
                      {userCharacters.map((char) => {
                        const charJoinId = `characters/${user?.id}/${slugify(char.name, { lower: true, strict: true })}.json`
                        return (
                          <div key={char.id} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
                            <CharacterSelectCard
                              className="ring-white/20"
                              character={char}
                              buttonLabel={ownHeroLabel(charJoinId)}
                              disabled={isJoining || askingId !== null}
                              onButtonClick={() => (invite ? handleAskForSeat(charJoinId, char.name) : handleJoinAdventure(charJoinId))}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {(!invite || bringOwn) && (
                  <Link href={`/player/${user?.username}/characters/new?redirectToAdventure=${encodeURIComponent(window.location.pathname)}`}>
                    <Button variant="epic" size="lg" className="mb-4">
                      Create New Character
                    </Button>
                  </Link>
                )}
                {availableCharacters.length > 0 && (
                  <>
                    <h3 className="text-lg font-display text-amber-400 my-8 w-full text-center">{takeHeading}</h3>
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
        {/* Owner can fill open slots with AI companions from the remaining premades.
            Secondary to inviting humans, so the roster stays collapsed until asked for. */}
        {isSignedIn && isOwner && userCharacter && hasEmptySlots && !invite && availableCharacters.length > 0 && (
          <div className="w-full flex flex-col items-center justify-center mb-8">
            {joinError && <div className="text-center text-red-400 text-sm mb-4 bg-red-900/20 px-4 py-2 rounded">{joinError}</div>}
            <Button
              variant="ghost"
              size="sm"
              className="text-sm text-sky-300 border border-sky-400/40 bg-sky-950/40 px-4 hover:text-sky-200 hover:bg-sky-900/50"
              onClick={() => setShowAiCompanions((open) => !open)}
              disabled={companionBusyId !== null}
            >
              {showAiCompanions ? "Hide AI Companions" : "Add AI Companions"}
            </Button>
            {showAiCompanions && (
              <>
                <p className="mt-4 mb-6 text-sm text-white/70 text-center max-w-2xl">AI companions fill open slots and take their own turns in character, so you can start without waiting for more players.</p>
                <div className="w-full flex flex-wrap gap-6 justify-center mb-4">
                  {availableCharacters.map((char) => (
                    <div key={char.id} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
                      <CharacterSelectCard
                        className="ring-white/20"
                        character={char}
                        buttonLabel={companionBusyId === char.id ? "Adding..." : "Add as AI"}
                        disabled={companionBusyId !== null}
                        onButtonClick={() => handleAddAiCompanion(char.id)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {isSignedIn && userCharacter && hasEmptySlots && !guestOfHost && <InviteLink inviteLink={inviteLink} />}
        {/* A hosted game has its host to talk to, even with one seat. */}
        {isSignedIn && userCharacter && (maxParty > 1 || hosted) && (
          <div className="fixed top-20 right-8 z-50">
            <GameChat />
          </div>
        )}
      </div>
    </>
  )
}
