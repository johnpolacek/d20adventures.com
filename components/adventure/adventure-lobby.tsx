"use client"

import { useUser } from "@clerk/nextjs"
import { playableHero } from "@d20/gm-core/character/hero-draft"
import { ChevronDown, Sparkles } from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import slugify from "slugify"
import { joinAdventure, requestSeat } from "@/app/_actions/join-adventure"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { Presence, Swap } from "@d20/ui/presence"
import { scrollToTop } from "@d20/ui/scroll"
import { siteLabel } from "@d20/ui/site"
import { NewHero } from "@/components/heroes/new-hero"
import type { Id } from "@/convex/_generated/dataModel"
import type { HeroCreation } from "@/lib/heroes/creation"
import { pictureAt } from "@/lib/images"
import { cn } from "@/lib/utils"
import type { Adventure } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PC, PCTemplate } from "@/types/character"
import { CharacterSheetModal } from "./character-sheet-modal"
import GameChat from "./game-chat"
import { CreateHeroCard, HeroCard, HeroRow, HeroRows, HeroTag } from "./hero-row"
import { PollPace } from "@/apps/desktop/src/poll-pace"
import { InviteLink } from "./invite-link"
import { LobbyIntro } from "./invite-sign-in"
import { StartAdventureButton } from "./start-adventure-button"

// A hosted game's seats for guests when the page loaded: the held heroes still open, the seat this guest's link
// names ("any" for a hero of their own), how many seats take a guest's own hero, whether the host approves this
// guest's hero, whether the host removed this guest, how many held seats are kept for a host who plays the hero
// their guests leave, how many more of their own heroes this guest may bring, their heroes waiting on the host, and
// their latest request with the host's answer.
type SeatRequest = { name: string; status: "pending" | "rejected" | "removed"; note?: string }
type OpenSeats = { open: number; flex?: boolean; approve: boolean; removed: boolean; keep?: number; more?: number; bring?: number; pending?: string[]; request?: SeatRequest }
export type LobbyInvite = OpenSeats & { seats: PCTemplate[]; as?: string }

type LobbyMutation =
  | { kind: "idle" }
  | { kind: "joining"; characterId: string }
  | { kind: "asking"; characterId: string }
  | { kind: "adding_ai"; characterId: string }
  | { kind: "removing_ai"; characterId: string }

type GuestView =
  | { kind: "signed_out" }
  | { kind: "seated_only" }
  | { kind: "table_full" }
  | { kind: "waiting_approval"; pendingNames: string[] }
  | { kind: "choosing" }

interface AdventureLobbyProps {
  adventure: Adventure
  adventurePlan?: AdventurePlan
  invite?: LobbyInvite
  // The GM runs in the host's app, so only the host starts the game.
  hosted?: boolean
  // Adventure races, classes, and hooks for building a custom hero inline on this page.
  creation?: HeroCreation
}

const wellClass = "rounded-xl border border-white/10 bg-[#0d0d13]/90 p-4 shadow-[inset_0_2px_8px_rgba(0,0,0,0.45)] sm:p-5"

// First name for a compact CTA ("Join as Thalbern") when it stays short enough for a 4-column card.
function joinButtonLabel(name: string, busy: boolean, ask?: boolean): string {
  if (ask) return busy ? "Asking..." : "Ask to Join"
  if (busy) return "Joining..."
  const first = name.trim().split(/\s+/)[0] ?? ""
  return first && first.length <= 10 ? `Join as ${first}` : "Join"
}

// Circular party seat medallions shown on the right side of the stage banner.
function PartyMedallions(props: {
  seated: PC[]
  hostHero?: PCTemplate
  totalSeats: number
  pendingCount: number
  isMine: (pc: PC) => boolean
  onOpen: (character: PC | PCTemplate) => void
}) {
  const filledCount = props.seated.length + (props.hostHero ? 1 : 0)
  const shownTotal = Math.max(filledCount + props.pendingCount, Math.min(props.totalSeats, 6))
  const openCount = Math.max(0, shownTotal - filledCount - props.pendingCount)

  return (
    <div className="flex flex-col items-start gap-2.5 lg:items-end">
      <div className={siteLabel}>
        Party · {props.seated.length} of {props.totalSeats}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {props.seated.map((pc) => {
          const mine = props.isMine(pc)
          const ai = pc.controlledBy === "ai"
          return (
            <Button
              key={pc.id}
              variant="plain"
              type="button"
              onClick={() => props.onOpen(pc)}
              className="group flex w-14 flex-col items-center gap-1.5 text-center transition-transform duration-150 ease-snap hover:-translate-y-0.5 active:scale-95"
            >
              <span
                className={cn(
                  "relative size-12 overflow-hidden rounded-full bg-black/75 ring-2 transition-shadow sm:size-[3.25rem]",
                  mine
                    ? "ring-accent-300 shadow-[0_0_18px_rgba(252,211,77,0.3)]"
                    : ai
                      ? "ring-sky-400/80 shadow-[0_0_14px_rgba(56,189,248,0.2)]"
                      : "ring-primary-300/80"
                )}
              >
                {pc.image && (
                  <Image
                    src={pictureAt(pc.image, 96)}
                    alt={pc.name}
                    fill
                    className="object-cover object-[50%_15%]"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
              </span>
              <span className={cn("w-full truncate font-sans text-2xs font-medium", mine ? "text-accent-200" : "text-white/85")}>
                {pc.name.split(" ")[0]}
              </span>
            </Button>
          )
        })}

        {props.hostHero && (
          <Button
            variant="plain"
            type="button"
            onClick={() => props.onOpen(props.hostHero!)}
            className="group flex w-14 flex-col items-center gap-1.5 text-center transition-transform duration-150 ease-snap hover:-translate-y-0.5 active:scale-95"
          >
            <span className="relative size-12 overflow-hidden rounded-full bg-black/75 ring-2 ring-accent-300/60 sm:size-[3.25rem]">
              {props.hostHero.image && (
                <Image
                  src={pictureAt(props.hostHero.image, 96)}
                  alt={props.hostHero.name}
                  fill
                  className="object-cover object-[50%_15%]"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
            </span>
            <span className="w-full truncate font-sans text-2xs font-medium text-accent-200/85">Host</span>
          </Button>
        )}

        {Array.from({ length: props.pendingCount }).map((_, idx) => (
          <div key={`pending-${idx}`} className="flex w-14 flex-col items-center gap-1.5 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-dashed border-accent-300/60 bg-accent-300/10 font-display text-sm text-accent-200 sm:size-[3.25rem]">
              ◇
            </span>
            <span className="w-full truncate font-sans text-2xs text-accent-200/80">Pending</span>
          </div>
        ))}

        {Array.from({ length: openCount }).map((_, idx) => (
          <div key={`open-${idx}`} className="flex w-14 flex-col items-center gap-1.5 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-dashed border-white/25 bg-black/55 font-display text-sm text-white/35 sm:size-[3.25rem]">
              ◇
            </span>
            <span className="w-full truncate font-sans text-2xs text-white/45">Open</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Waiting room of an existing adventure, before it begins
export default function AdventureLobby({ adventure: initialAdventure, adventurePlan, invite, hosted, creation }: AdventureLobbyProps) {
  const { user, isSignedIn, isLoaded } = useUser()
  const params = useParams()
  const [mutation, setMutation] = useState<LobbyMutation>({ kind: "idle" })
  const mutationSeqRef = useRef(0)
  const [modalCharacter, setModalCharacter] = useState<PC | PCTemplate | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [creatingHero, setCreatingHero] = useState(false)
  const [adventure, setAdventure] = useState(initialAdventure)
  const [userCharacters, setUserCharacters] = useState<PCTemplate[]>([])
  const [isLoadingUserChars, setIsLoadingUserChars] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})
  const hasFetchedUserChars = useRef(false)
  // The open seats and this guest's request, kept current by the poll below.
  const [seat, setSeat] = useState<OpenSeats>({
    open: invite?.open ?? 0,
    flex: invite?.flex,
    approve: invite?.approve ?? false,
    removed: invite?.removed ?? false,
    keep: invite?.keep,
    more: invite?.more,
    bring: invite?.bring,
    pending: invite?.pending,
    request: invite?.request,
  })
  const [changingHero, setChangingHero] = useState(false)

  // Sequential AbortController poller for adventure updates (only when signed in). Every 3s while the lobby changes,
  // slowing to 12s while it waits, and not at all while hidden.
  useEffect(() => {
    if (!isSignedIn) return

    const controller = new AbortController()
    const pace = new PollPace(3000, 12000)

    void (async () => {
      let last = ""
      if (!(await pace.wait(pace.baseMs, controller.signal))) return
      for (;;) {
        const seq = mutationSeqRef.current
        let changed = true
        try {
          const response = await fetch(`/api/adventure/${params.adventureId}`, {
            cache: "no-store",
            signal: controller.signal,
          })
          if (response.ok && !controller.signal.aborted) {
            const text = await response.text()
            changed = text !== last
            last = text
            if (changed && !controller.signal.aborted && seq === mutationSeqRef.current) {
              const updatedAdventure = JSON.parse(text)
              setAdventure(updatedAdventure)
              if (updatedAdventure.seat) setSeat(updatedAdventure.seat)
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return
          console.error("Failed to poll adventure updates:", error)
        }
        if (!(await pace.after(changed, controller.signal))) return
      }
    })()

    return () => controller.abort()
  }, [params.adventureId, isSignedIn])

  useEffect(() => {
    if (isLoaded) {
      scrollToTop()
    }
  }, [isLoaded])

  useEffect(() => {
    const party = adventure.party
    const userCharacter = party?.find((pc) => pc.userId === user?.id && pc.controlledBy !== "ai")

    // A seated guest may still bring more of their own heroes to open seats.
    if (isSignedIn && (!userCharacter || (invite?.open ?? 0) > 0) && !hasFetchedUserChars.current) {
      hasFetchedUserChars.current = true
      setIsLoadingUserChars(true)
      fetch(`/api/user-characters?userId=${user?.id}`)
        .then((res) => res.json())
        .then(setUserCharacters)
        .finally(() => setIsLoadingUserChars(false))
    }
  }, [isSignedIn, user?.id])

  // Fetch player names for characters in the party, once per change in who is at the table.
  const partyUserIds = [...new Set((adventure.party || []).map((pc) => pc.userId).filter(Boolean))].sort().join(",")
  useEffect(() => {
    if (!isSignedIn || !partyUserIds) return
    fetch("/api/users/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: partyUserIds.split(",") }),
    })
      .then((res) => res.json())
      .then((data) => setPlayerNames(data.users || {}))
      .catch((err) => console.error("Failed to fetch player names:", err))
  }, [partyUserIds, isSignedIn])

  const handleJoinAdventure = async (characterId: string) => {
    if (mutation.kind !== "idle") return

    mutationSeqRef.current++
    setMutation({ kind: "joining", characterId })
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
      setMutation({ kind: "idle" })
    }
  }

  // Takes an open seat with one of the guest's own heroes, or asks the host for it where the host approves heroes.
  const handleAskForSeat = async (characterId: string, name: string) => {
    if (mutation.kind !== "idle") return
    mutationSeqRef.current++
    setMutation({ kind: "asking", characterId })
    setJoinError(null)
    const { seated, error }: { seated?: boolean; error?: string } = await requestSeat({ adventureId: adventure.id, characterId }).catch(() => ({ error: "That seat could not be taken." }))
    // Seated at once: load again as a player, on the same link.
    if (seated) return window.location.replace(window.location.pathname + window.location.search)
    if (error) setJoinError(error)
    else {
      mutationSeqRef.current++
      setSeat((s) => ({ ...s, bring: Math.max(0, (s.bring ?? 1) - 1), pending: [...(s.pending ?? []), name], request: { name, status: "pending" } }))
      setChangingHero(false)
    }
    setMutation({ kind: "idle" })
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

  const [showAiCompanions, setShowAiCompanions] = useState(false)

  const handleAddAiCompanion = async (characterId: string) => {
    if (mutation.kind !== "idle") return
    mutationSeqRef.current++
    setMutation({ kind: "adding_ai", characterId })
    setJoinError(null)
    try {
      const { addAiCompanionAction } = await import("@/app/_actions/manage-ai-companions")
      await addAiCompanionAction({ adventureId: adventure.id as Id<"adventures">, characterId })
      const response = await fetch(`/api/adventure/${params.adventureId}`, { cache: "no-store" })
      if (response.ok) {
        mutationSeqRef.current++
        setAdventure(await response.json())
      }
    } catch (error) {
      console.error("Failed to add AI companion:", error)
      setJoinError(error instanceof Error ? error.message : "Failed to add AI companion")
    } finally {
      setMutation({ kind: "idle" })
    }
  }

  const handleRemoveAiCompanion = async (characterId: string) => {
    if (mutation.kind !== "idle") return
    mutationSeqRef.current++
    setMutation({ kind: "removing_ai", characterId })
    setJoinError(null)
    try {
      const { removeAiCompanionAction } = await import("@/app/_actions/manage-ai-companions")
      await removeAiCompanionAction({ adventureId: adventure.id as Id<"adventures">, characterId })
      const response = await fetch(`/api/adventure/${params.adventureId}`, { cache: "no-store" })
      if (response.ok) {
        mutationSeqRef.current++
        setAdventure(await response.json())
      }
    } catch (error) {
      console.error("Failed to remove AI companion:", error)
      setJoinError(error instanceof Error ? error.message : "Failed to remove AI companion")
    } finally {
      setMutation({ kind: "idle" })
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
  // A seated guest whose link names another open hero may take that one too, as may one with heroes left to choose.
  const another = Boolean(invite && userCharacter && (namedSeat || (seat.more ?? 0) > 0) && !seat.removed)
  const availableCharacters = userCharacter && !another ? [] : invite ? heldSeats : adventurePlan?.premadePlayerCharacters?.filter(notSeated) || []
  const waitingOnHost = Boolean(seat.pending?.length) && !changingHero
  // How many more of their own heroes this guest may bring. A page from before the limit took one.
  const bringLeft = seat.bring ?? (userCharacter || seat.pending?.length ? 0 : 1)
  // A seated guest with heroes left to bring.
  const bringMore = Boolean(invite && userCharacter && seat.open > 0 && bringLeft > 0 && !seat.removed)
  const mutationBusy = mutation.kind !== "idle"
  // Join seats a guest's own hero at once. Ask to join waits for the host.
  const ownHeroLabel = (id: string, name: string) => {
    const busy = invite ? mutation.kind === "asking" && mutation.characterId === id : mutation.kind === "joining" && mutation.characterId === id
    return joinButtonLabel(name, busy, Boolean(invite && seat.approve))
  }
  const bringOwn = Boolean(invite) && seat.open > 0 && (!namedSeat || seat.removed) && (bringLeft > 0 || changingHero)
  // Their heroes not already at the table, nor a copy of a hero offered beside them.
  const ownHeroes = userCharacters.filter((c) => playableHero(c) && !party?.some((p) => p.id === c.id || p.name === c.name))
  const isOwner = user?.id === adventure.ownerId
  // In a hosted game the host invites and starts, from their app.
  const guestOfHost = Boolean(hosted && !isOwner)

  // Generate the invite link for the lobby
  const inviteLink = typeof window !== "undefined" ? `${window.location.origin}/settings/${params.settingId}/${params.adventurePlanId}/${adventure.id}` : ""
  // Calculate min and max party size. The host sets a hosted game's party in their app, so its host starts with any
  // hero seated, as the app does.
  const minParty = hosted ? 1 : adventurePlan?.party?.[0] || 1
  const maxParty = adventurePlan?.party?.[1] || 4
  const currentPartySize = party?.length || 0
  const canStartAdventure = currentPartySize >= minParty
  const partyIsFull = currentPartySize >= maxParty
  const hasEmptySlots = (party?.length || 0) < maxParty
  // The seats the host set, or the adventure's most, and who sits in them, the guest's own heroes first.
  const seats = invite ? (party?.length ?? 0) + (seat.flex ? 0 : unseated.length) + seat.open : maxParty
  const seated = [...(party ?? [])].sort((a, b) => Number(mine(b)) - Number(mine(a)))
  const ownChoices = !invite || bringOwn ? ownHeroes.filter((c) => !availableCharacters.some((a) => a.name === c.name)) : []
  // Derived guest view: what seat-selection state the signed-in user is in.
  const guestView: GuestView = !isSignedIn
    ? { kind: "signed_out" }
    : userCharacter && !another && !bringMore
      ? { kind: "seated_only" }
      : invite && availableCharacters.length === 0 && seat.open < 1 && !seat.removed
        ? { kind: "table_full" }
        : waitingOnHost && seat.open > 0
          ? { kind: "waiting_approval", pendingNames: seat.pending ?? [] }
          : { kind: "choosing" }
  const joining = guestView.kind === "table_full" || guestView.kind === "waiting_approval" || guestView.kind === "choosing"
  const canCreateHero = !invite || bringOwn
  const hasHeroChoices = ownChoices.length + availableCharacters.length > 0
  const showHeroRoster = hasHeroChoices || canCreateHero
  const createHeroHref =
    typeof window !== "undefined"
      ? `/player/${user?.username}/characters/new?redirectToAdventure=${encodeURIComponent(window.location.pathname + window.location.search)}`
      : `/player/${user?.username}/characters/new`
  const pendingCount = seat.pending?.length ?? 0
  // When seated without choosing another hero, show the detailed seated roster below the banner (gives owners AI Remove controls too).
  const showSeatedRosterPanel = Boolean(userCharacter && !joining) || Boolean(isOwner && seated.some((pc) => pc.controlledBy === "ai"))

  const body = (
    <div className="flex w-full flex-col gap-6">
      {/* Hero Portrait Gallery (Choose Your Hero) */}
      <Presence show={joining} motion="fade" asChild>
        {joining && (
          <div className="w-full">
            {isLoadingUserChars ? (
              <div className={cn(wellClass, "py-12 text-center font-sans text-xs text-white/55")}>
                Loading your characters…
              </div>
            ) : (
              <div className="enter-fade flex w-full flex-col gap-4">
                <Presence show={Boolean(joinError && !/redirect/i.test(joinError))} motion="drop" asChild>
                  <div className="rounded-lg border border-red-400/30 bg-red-950/40 px-4 py-2.5 text-center font-sans text-xs text-red-200">
                    {joinError}
                  </div>
                </Presence>

                <Presence show={guestView.kind === "table_full"} motion="fade" asChild>
                  <div className={cn(wellClass, "mx-auto w-full max-w-2xl text-center font-sans text-sm text-white/75")}>
                    Every seat at this table is taken.
                  </div>
                </Presence>

                <Presence show={guestView.kind === "waiting_approval"} asChild>
                  <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-300/30 bg-accent-300/[0.07] px-4 py-3">
                    <span className="inline-flex items-center gap-2.5 font-sans text-xs text-accent-100">
                      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent-400 shadow-[0_0_0_3px_rgba(251,191,36,0.2)]" />
                      <span>Waiting for the host to approve {seat.pending?.join(" and ")}.</span>
                    </span>
                    <Button variant="outline" size="xs" onClick={() => setChangingHero(true)}>
                      Choose another hero
                    </Button>
                  </div>
                </Presence>

                <Presence show={Boolean(seat.request && seat.request.status !== "pending")} motion="drop" asChild>
                  {seat.request && seat.request.status !== "pending" && (
                    <p className="rounded-lg border border-accent-300/25 bg-accent-900/25 px-4 py-2.5 font-sans text-xs text-accent-200">
                      The host {seat.request.status === "removed" ? "removed" : "declined"} {seat.request.name}
                      {seat.request.note ? `: ${seat.request.note}` : "."}
                    </p>
                  )}
                </Presence>

                <Presence show={showHeroRoster} motion="fade" asChild>
                  <Swap id={creatingHero && creation ? "create" : "roster"} motion="fade" initial={false} className="w-full">
                    {creatingHero && creation ? (
                      <NewHero
                        inline
                        creation={creation}
                        lobby={{
                          href: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
                          settingId: params.settingId as string,
                          planId: params.adventurePlanId as string,
                          adventureId: adventure.id,
                          hosted: Boolean(hosted),
                        }}
                        onClose={() => setCreatingHero(false)}
                        onPendingSeat={(name) => {
                          mutationSeqRef.current++
                          setSeat((s) => ({
                            ...s,
                            bring: Math.max(0, (s.bring ?? 1) - 1),
                            pending: [...(s.pending ?? []), name],
                            request: { name, status: "pending" },
                          }))
                          setChangingHero(false)
                          setCreatingHero(false)
                        }}
                      />
                    ) : (
                      <section className="w-full">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                          <div className={siteLabel}>{userCharacter ? "Add Another Hero" : "Choose Your Hero"}</div>
                          {hasHeroChoices && (
                            <span className="font-sans text-xs text-white/45">Click any portrait to read their full sheet</span>
                          )}
                        </div>
                        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <HeroRows>
                            {ownChoices.map((char) => {
                              const charJoinId = `characters/${user?.id}/${slugify(char.name, { lower: true, strict: true })}.json`
                              return (
                                <HeroCard
                                  key={char.id}
                                  character={char}
                                  badge="Your Hero"
                                  onOpen={() => handlePartySlotClick(char)}
                                  action={{
                                    label: ownHeroLabel(charJoinId, char.name),
                                    disabled: mutationBusy,
                                    onClick: () => (invite ? handleAskForSeat(charJoinId, char.name) : handleJoinAdventure(charJoinId)),
                                  }}
                                />
                              )
                            })}
                            {availableCharacters.map((char) => (
                              <HeroCard
                                key={char.id}
                                character={char}
                                onOpen={() => handlePartySlotClick(char)}
                                action={{
                                  label: joinButtonLabel(char.name, mutation.kind === "joining" && mutation.characterId === char.id),
                                  disabled: mutationBusy,
                                  onClick: () => handleJoinAdventure(char.id),
                                }}
                              />
                            ))}
                          </HeroRows>
                          {canCreateHero && (
                            <CreateHeroCard
                              onClick={creation ? () => setCreatingHero(true) : undefined}
                              href={!creation ? createHeroHref : undefined}
                              prominent={!hasHeroChoices}
                              className={cn(!hasHeroChoices && "sm:col-span-2 lg:col-span-4")}
                            />
                          )}
                        </ul>
                      </section>
                    )}
                  </Swap>
                </Presence>
              </div>
            )}
          </div>
        )}
      </Presence>

      {/* Seated party & session controls */}
      {Boolean(userCharacter) && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {/* Hosted waiting readiness strip for seated guests */}
          <Presence show={Boolean(isSignedIn && userCharacter && guestOfHost)} motion="fade" asChild>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-sans text-xs text-white/85">
              <span className="inline-flex items-center gap-2.5">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent-400 shadow-[0_0_0_3px_rgba(251,191,36,0.2)]" />
                <span>You&apos;re seated at the table. Waiting for the host to start the adventure…</span>
              </span>
              {seats > 0 && (
                <span className="shrink-0 font-mono text-3xs tracking-label opacity-70">
                  {party?.length ?? 0}/{seats} SEATED
                </span>
              )}
            </div>
          </Presence>

          {/* Start Adventure controls for non-hosted (or host) owner */}
          <Presence show={Boolean(isSignedIn && userCharacter && !guestOfHost)} motion="fade">
            <StartAdventureButton
              canStartAdventure={canStartAdventure}
              partyIsFull={partyIsFull}
              isSignedIn={Boolean(isSignedIn)}
              adventure={adventure}
              minParty={minParty}
              maxParty={maxParty}
              currentPartySize={currentPartySize}
              settingId={params.settingId as string}
              adventurePlanId={params.adventurePlanId as string}
            />
          </Presence>

          {/* Seated Party Roster (gives quick sheet inspection and owner AI removal) */}
          {showSeatedRosterPanel && (seated.length > 0 || hostSeat?.hero) && (
            <section className={wellClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className={siteLabel}>At the Table · {party?.length ?? 0} of {seats}</div>
                <span className="font-sans text-2xs text-white/45">Click a hero to view sheet</span>
              </div>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                <HeroRows>
                  {seated.map((pc) => (
                    <HeroRow
                      key={pc.id}
                      character={pc}
                      mine={mine(pc)}
                      onOpen={() => handlePartySlotClick(pc)}
                      tag={
                        mine(pc) ? (
                          <HeroTag tone="you">{user?.username || "You"}</HeroTag>
                        ) : pc.controlledBy === "ai" ? (
                          <HeroTag tone="ai">AI</HeroTag>
                        ) : (
                          <HeroTag tone="player">{(pc.userId && playerNames[pc.userId]) || "Player"}</HeroTag>
                        )
                      }
                      action={pc.controlledBy === "ai" && isOwner ? { label: "Remove", onClick: () => handleRemoveAiCompanion(pc.id), disabled: mutationBusy } : undefined}
                    />
                  ))}
                  {hostSeat?.hero && (
                    <HeroRow key="host" character={hostSeat.hero} onOpen={() => handlePartySlotClick(hostSeat.hero!)} tag={<HeroTag tone="host">Host</HeroTag>} />
                  )}
                </HeroRows>
              </ul>
            </section>
          )}

          {/* Invite link for owners with open slots */}
          <Presence show={Boolean(isSignedIn && userCharacter && hasEmptySlots && !guestOfHost)} motion="fade">
            <InviteLink inviteLink={inviteLink} />
          </Presence>

          {/* Owner can fill open slots with AI companions from the remaining premades.
              Secondary to inviting humans, so the roster stays collapsed until asked for. */}
          <Presence show={Boolean(isSignedIn && isOwner && userCharacter && hasEmptySlots && !invite && availableCharacters.length > 0)} motion="fade" asChild>
            <section className={wellClass}>
              <Presence show={Boolean(joinError)} motion="drop" asChild>
                <div className="mb-3 rounded-lg border border-red-400/30 bg-red-950/40 px-4 py-2 text-center font-sans text-xs text-red-200">
                  {joinError}
                </div>
              </Presence>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles aria-hidden="true" className="size-3.5 text-sky-300/80" />
                  <span className={siteLabel}>AI Companions</span>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  className="gap-1.5 border-sky-400/30 bg-sky-950/40 text-sky-200 hover:border-sky-300/50 hover:bg-sky-900/50 hover:text-white"
                  onClick={() => setShowAiCompanions((open) => !open)}
                  disabled={mutationBusy}
                >
                  <span>{showAiCompanions ? "Hide AI Companions" : "Add AI Companions"}</span>
                  <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-200", showAiCompanions && "rotate-180")} />
                </Button>
              </div>
              <Presence show={showAiCompanions} motion="drop" className="mt-3">
                <p className="mb-3 font-sans text-xs text-white/60">
                  AI companions fill open slots and take their own turns in character, so you can start without waiting for more players.
                </p>
                <ul className="grid w-full gap-2.5 sm:grid-cols-2">
                  <HeroRows>
                    {availableCharacters.map((char) => (
                      <HeroRow
                        key={char.id}
                        character={char}
                        onOpen={() => handlePartySlotClick(char)}
                        action={{
                          label: mutation.kind === "adding_ai" && mutation.characterId === char.id ? "Adding..." : "Add as AI",
                          disabled: mutationBusy,
                          onClick: () => handleAddAiCompanion(char.id),
                        }}
                      />
                    ))}
                  </HeroRows>
                </ul>
              </Presence>
            </section>
          </Presence>
        </div>
      )}
    </div>
  )

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

      {adventurePlan ? (
        <LobbyIntro
          plan={adventurePlan}
          bannerRight={
            <PartyMedallions
              seated={seated}
              hostHero={hostSeat?.hero}
              totalSeats={seats}
              pendingCount={pendingCount}
              isMine={mine}
              onOpen={handlePartySlotClick}
            />
          }
        >
          {body}
        </LobbyIntro>
      ) : (
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:px-8">{body}</div>
      )}

      {/* A hosted game has its host to talk to, even with one seat. */}
      <Presence show={Boolean(isSignedIn && userCharacter && (maxParty > 1 || hosted))} motion="fade" asChild>
        <div className="fixed top-20 right-8 z-overlay">
          <GameChat />
        </div>
      </Presence>
    </>
  )
}
