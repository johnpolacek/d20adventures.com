"use client"

import { useState } from "react"
import { createAdventure } from "@/app/_actions/create-adventure"
import { textShadow } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CharacterSelectCard } from "@/components/ui/character-select-card"
import Image from "@/components/ui/native-image"
import { cn, getImageUrl } from "@/lib/utils"
import type { PCTemplate } from "@/types/character"

interface PartySetupProps {
  settingId: string
  adventurePlanId: string
  selectedCharacterId: string
  selectedCharacterName: string
  selectedCharacterImage?: string
  companions: PCTemplate[]
  party: [number, number]
  onBack?: () => void
}

function PartySlotAvatar({ image, name, label, labelClass, ringClass, onClick, title }: { image?: string; name?: string; label: string; labelClass: string; ringClass: string; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <div className={cn("relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-black/60 ring-2", ringClass)}>
        {image ? (
          <Image src={getImageUrl(image)} alt={name || label} fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/40 text-2xl font-display">?</div>
        )}
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
      </div>
      <span className={cn("text-[10px] font-mono tracking-wider uppercase", labelClass)}>{label}</span>
      <span className="text-xs text-white/80 max-w-20 truncate">{name ? name.split(" ")[0] : null}</span>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className="flex flex-col items-center gap-1 cursor-pointer transition-transform active:scale-[0.96] hover:-translate-y-0.5">
        {body}
      </button>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1" title={title}>
      {body}
    </div>
  )
}

// Step two of adventure setup: the player has picked their character and now
// starts right away, opens a lobby for friends, or (secondary, collapsed by
// default) adds AI-played companions to fill the party.
export default function PartySetup({ settingId, adventurePlanId, selectedCharacterId, selectedCharacterName, selectedCharacterImage, companions, party, onBack }: PartySetupProps) {
  const [companionIds, setCompanionIds] = useState<Set<string>>(new Set())
  const [showCompanions, setShowCompanions] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [minParty, maxParty] = party
  const partySize = 1 + companionIds.size
  const canStartNow = partySize >= minParty
  const partyFull = partySize >= maxParty
  const addedCompanions = companions.filter((companion) => companionIds.has(companion.id))
  const openSlots = Math.max(0, maxParty - partySize)

  function toggleCompanion(id: string) {
    setCompanionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (partySize < maxParty) {
        next.add(id)
      }
      return next
    })
  }

  async function submit(startImmediately: boolean) {
    if (isCreating) return
    setIsCreating(true)
    setError(null)
    try {
      await createAdventure({
        settingId,
        adventurePlanId,
        characterChoices: [
          { characterId: selectedCharacterId, mode: "player" },
          ...Array.from(companionIds).map((characterId) => ({ characterId, mode: "ai" as const })),
        ],
        startImmediately,
      })
      // The redirect happens in the server action.
    } catch (err) {
      const isRedirectError = err && typeof err === "object" && "digest" in err && String((err as { digest?: string }).digest).includes("NEXT_REDIRECT")
      if (isRedirectError) throw err
      console.error("Failed to create adventure:", err)
      setError(err instanceof Error ? err.message : "Failed to start adventure.")
      setIsCreating(false)
    }
  }

  return (
    <div className="flex flex-col items-center w-full max-w-6xl px-4">
      <Card className="w-full max-w-2xl text-center p-8 sm:p-10 bg-gradient-to-tl from-black/80 to-black/60 border-none ring-8 ring-black/20 rounded-2xl">
        <h2 style={textShadow} className="text-3xl sm:text-4xl font-display font-bold text-amber-300 text-balance mb-2">
          Choose Your Party
        </h2>
        <p className="text-indigo-100 text-pretty mb-1">
          Playing as <span className="text-amber-300 font-bold">{selectedCharacterName}</span>
          {onBack && (
            <>
              {" · "}
              <button type="button" onClick={onBack} disabled={isCreating} className="underline underline-offset-4 decoration-indigo-300/50 text-indigo-200 hover:text-white transition-colors">
                change
              </button>
            </>
          )}
        </p>
        <p className="text-sm text-white/60 tabular-nums mb-6">
          {partySize} of {minParty}–{maxParty} party members
        </p>

        {/* Party at a glance: you, any AI companions, and open slots for friends */}
        <div className="flex items-start justify-center gap-4 sm:gap-6 mb-6">
          <PartySlotAvatar image={selectedCharacterImage} name={selectedCharacterName} label="You" labelClass="text-amber-300" ringClass="ring-amber-400/90" />
          {addedCompanions.map((companion) => (
            <PartySlotAvatar
              key={companion.id}
              image={companion.image}
              name={companion.name}
              label="AI"
              labelClass="text-sky-300"
              ringClass="ring-sky-400/90"
              title={`${companion.name} — AI companion (click to manage)`}
              onClick={() => setShowCompanions(true)}
            />
          ))}
          {Array.from({ length: openSlots }).map((_, index) => (
            <button
              key={`open-${index}`}
              type="button"
              title="Open slot — invite a friend or add an AI companion"
              onClick={() => setShowCompanions(true)}
              className="flex flex-col items-center gap-1 cursor-pointer transition-transform active:scale-[0.96] hover:-translate-y-0.5"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-dashed border-white/25 flex items-center justify-center text-white/40 text-2xl font-light hover:border-sky-300/60 hover:text-sky-200 transition-colors">
                +
              </div>
              <span className="text-[10px] font-mono tracking-wider uppercase text-white/40">Open</span>
              <span className="text-xs text-transparent select-none">&nbsp;</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
          <Button
            variant="epic"
            size="lg"
            className="text-lg py-6 px-8 w-full sm:w-auto whitespace-nowrap transition-transform active:scale-[0.96] disabled:opacity-40 disabled:saturate-50"
            onClick={() => submit(true)}
            disabled={isCreating || !canStartNow}
          >
            {isCreating ? "Creating Adventure..." : "Start Adventure"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="text-lg py-6 px-8 w-full sm:w-auto whitespace-nowrap bg-black/30 transition-transform active:scale-[0.96]"
            onClick={() => submit(false)}
            disabled={isCreating}
          >
            Create Lobby &amp; Invite Friends
          </Button>
        </div>

        <p className="text-sm text-white/60 text-pretty max-w-md mx-auto">
          {canStartNow
            ? addedCompanions.length > 0
              ? "Start now with your AI companions, or open a lobby so friends can take the open slots."
              : "Start now, or open a lobby so friends can join you."
            : `This adventure needs at least ${minParty} party members. Create a lobby to invite friends, or add ${minParty - partySize} AI companion${minParty - partySize === 1 ? "" : "s"} to start right away.`}
        </p>

        {!showCompanions && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-5 text-sm text-sky-300 border border-sky-400/40 bg-sky-950/40 px-4 hover:text-sky-200 hover:bg-sky-900/50 transition-colors"
            onClick={() => setShowCompanions(true)}
            disabled={isCreating}
          >
            {addedCompanions.length > 0 ? "Manage AI Companions" : "Add AI Companions"}
          </Button>
        )}
        {error && <p className="text-red-300 mt-4">{error}</p>}
      </Card>

      {showCompanions && (
        <div className="w-full flex flex-col items-center mt-10 fade-in">
          <h3 style={textShadow} className="text-2xl font-display font-bold text-sky-200 text-balance mb-1">
            AI Companions
          </h3>
          <p className="text-sm text-white/70 text-pretty text-center max-w-2xl mb-2">Companions are played by the game, taking their own turns in character alongside you.</p>
          <Button variant="ghost" size="sm" className="mb-6 text-sm text-sky-300/80 hover:text-sky-200 transition-colors" onClick={() => setShowCompanions(false)} disabled={isCreating}>
            Hide
          </Button>
          <div className="flex flex-wrap gap-8 justify-center w-full">
            {companions.map((companion) => {
              const added = companionIds.has(companion.id)
              return (
                <div key={companion.id} className={cn("w-full sm:w-1/2 md:w-1/3 lg:w-1/4 relative transition-transform duration-300", added && "scale-[1.02]")}>
                  {added && <div className="absolute top-2 left-2 z-20 text-xs font-mono text-sky-300 bg-sky-900/80 border border-sky-300 rounded px-2 py-1">AI COMPANION</div>}
                  <CharacterSelectCard
                    character={companion}
                    buttonLabel={added ? "Remove" : "Add to Party"}
                    onButtonClick={() => !isCreating && toggleCompanion(companion.id)}
                    disabled={isCreating || (!added && partyFull)}
                    className={added ? "ring-sky-400/60 border-sky-400/60" : ""}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
