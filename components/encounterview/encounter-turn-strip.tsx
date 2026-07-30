"use client"

// Bottom strip of the fullscreen encounter view: collapsed stack of character
// avatars (expandable into the full initiative bar), live caption ticker with a
// read-more into the turn modal, and a state-aware call to action that opens
// the turn modal. Pure render over TurnContext — the page's TurnNarrative
// underneath the overlay keeps owning NPC triggers and auto-navigation.

import { ChevronsRight, CircleCheckBig } from "lucide-react"
import { useState } from "react"
import { useTurnActor } from "@/components/adventure/use-turn-actor"
import { Button } from "@/components/ui/button"
import NativeImage from "@/components/ui/native-image"
import { cn, getImageUrl } from "@/lib/utils"
import type { TurnCharacter } from "@/types/adventure"
import { formatCaptionPart, useCaptionTicker } from "./use-caption-ticker"

function isDeadCharacter(character: TurnCharacter): boolean {
  return character.healthPercent === 0 || character.status === "dead"
}

function InitiativePortrait({ character, isCurrent, isPlayer }: { character: TurnCharacter; isCurrent: boolean; isPlayer: boolean }) {
  const isDead = isDeadCharacter(character)
  return (
    <div className="relative flex-none pt-1 pb-2" title={`${character.name} — initiative ${character.initiative}`}>
      <div
        className={cn(
          "relative h-9 w-9 overflow-hidden rounded-lg border border-white/30 bg-black transition-all duration-500 sm:h-10 sm:w-10",
          isCurrent && !isDead && "ring-2 ring-amber-400",
          !isCurrent && !isDead && "opacity-80",
          isDead && "opacity-40 grayscale"
        )}
      >
        {character.image && <NativeImage src={getImageUrl(character.image)} alt={character.name} fill className="absolute inset-0 h-full w-full rounded-lg object-cover" />}
        {!isDead && character.healthPercent < 100 && (
          <div
            className="absolute top-0 left-0 h-full bg-red-800 transition-all duration-1000 ease-in-out"
            style={{ width: `${100 - character.healthPercent}%`, opacity: (100 - character.healthPercent) / 100 }}
          />
        )}
      </div>
      {character.isComplete && !isDead && <CircleCheckBig className="absolute -top-0.5 -right-1 h-3.5 w-3.5 rounded-full bg-black text-green-500 ring-1 ring-black" />}
      {isDead && <div className="absolute -bottom-0 left-1/2 -translate-x-1/2 rounded bg-black px-1 font-mono text-[8px] font-bold text-red-400 ring-1 ring-red-700">DEAD</div>}
      {isPlayer && !isDead && <div className="absolute -bottom-0 left-1/2 -translate-x-1/2 rounded bg-black px-1 font-mono text-[8px] font-bold tracking-wide text-amber-300/90 ring-1 ring-primary-600">YOU</div>}
    </div>
  )
}

// Collapsed view of the initiative bar: overlapping circle avatars. Clicking
// expands into the full character bar.
function AvatarStack({ characters, currentId, onExpand }: { characters: TurnCharacter[]; currentId?: string; onExpand: () => void }) {
  return (
    <button type="button" onClick={onExpand} aria-label="Show turn order" aria-expanded={false} className="group flex flex-none cursor-pointer items-center -space-x-3 px-1" title="Show turn order">
      {characters.map((character) => {
        const isDead = isDeadCharacter(character)
        return (
          <span
            key={character.id}
            className={cn(
              "relative h-8 w-8 overflow-hidden rounded-full bg-black ring-2 transition-transform duration-300 group-hover:-translate-y-0.5",
              character.id === currentId && !isDead ? "z-10 ring-amber-400" : "ring-black",
              isDead && "opacity-40 grayscale"
            )}
            title={character.name}
          >
            {character.image && <NativeImage src={getImageUrl(character.image)} alt={character.name} fill className="absolute inset-0 h-full w-full rounded-full object-cover" />}
          </span>
        )
      })}
    </button>
  )
}

function PulseDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 pl-1.5", className)}>
      <span className="h-1 w-1 animate-pulse rounded-full bg-indigo-300" style={{ animationDelay: "0ms", animationDuration: "2s" }} />
      <span className="h-1 w-1 animate-pulse rounded-full bg-indigo-300" style={{ animationDelay: "200ms", animationDuration: "2s" }} />
      <span className="h-1 w-1 animate-pulse rounded-full bg-indigo-300" style={{ animationDelay: "400ms", animationDuration: "2s" }} />
    </span>
  )
}

function ReadMore({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ml-1.5 inline cursor-pointer whitespace-nowrap text-xs not-italic text-indigo-300 underline decoration-indigo-400/50 underline-offset-2 hover:text-indigo-200">
      Read more
    </button>
  )
}

export default function EncounterTurnStrip({ sceneSummary, insufficientTokens, restaging, onOpenTurn }: { sceneSummary?: string; insufficientTokens?: boolean; restaging?: boolean; onOpenTurn: () => void }) {
  const { currentTurn, disableSSE, charactersByInitiative, currentCharacter, isTurnComplete, isNpcProcessing, shouldShowReply, playerCharacter, allPCsDead } = useTurnActor()
  const caption = useCaptionTicker(currentTurn)
  const [barExpanded, setBarExpanded] = useState(false)

  if (!currentTurn) return null

  const rollPending = shouldShowReply && currentCharacter?.rollRequired && currentCharacter?.rollResult == null

  const cta: { label: string; variant: "epic" | "outline"; className?: string } = disableSSE
    ? { label: "Viewing past turn — View", variant: "outline" as const }
    : shouldShowReply
      ? { label: rollPending ? "Your Turn — Roll" : "Your Turn — Reply", variant: "epic" as const }
      : allPCsDead
        ? { label: "Game Over — View", variant: "outline" as const, className: "border-red-700 text-red-300 hover:text-red-200" }
        : currentTurn.isFinalEncounter
          ? { label: "Encounter complete — View", variant: "outline" as const }
          : isTurnComplete
            ? { label: "Turn complete — Continue", variant: "epic" as const }
            : { label: `Waiting on ${currentCharacter?.name ?? "the party"}…`, variant: "outline" as const }

  return (
    <div className="flex flex-none flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t border-white/10 bg-black/80 px-3 py-2 sm:px-5">
      <div className="order-last w-full min-w-0 basis-full text-right sm:order-none sm:w-auto sm:basis-auto sm:flex-1">
        {caption ? (
          <p className={cn("line-clamp-1 text-sm italic", caption.type === "diceroll" ? "font-mono not-italic text-amber-200/90" : "text-stone-200")}>
            {formatCaptionPart(caption)}
            {caption.type === "paragraph" && <ReadMore onClick={onOpenTurn} />}
          </p>
        ) : isNpcProcessing && !disableSSE && !currentTurn.isFinalEncounter ? (
          <p className="text-sm italic text-indigo-300">
            {currentCharacter?.name} is rolling
            <PulseDots />
          </p>
        ) : restaging ? (
          <p className="text-sm italic text-stone-400">
            Staging next scene
            <PulseDots className="[&>span]:bg-stone-400" />
          </p>
        ) : sceneSummary ? (
          <p className="line-clamp-1 text-sm italic text-stone-400">
            {sceneSummary}
            <ReadMore onClick={onOpenTurn} />
          </p>
        ) : null}
        {insufficientTokens && <p className="mt-0.5 text-xs text-amber-500/90">Not enough tokens to generate some miniatures.</p>}
      </div>

      {barExpanded ? (
        <div className="flex max-w-full flex-none items-center gap-2 overflow-x-auto">
          {charactersByInitiative.map((character) => (
            <InitiativePortrait key={character.id} character={character} isCurrent={character.id === currentCharacter?.id} isPlayer={character.id === playerCharacter?.id} />
          ))}
          <button type="button" onClick={() => setBarExpanded(false)} aria-label="Collapse turn order" className="flex-none cursor-pointer rounded p-1 text-stone-400 transition-colors hover:bg-white/10 hover:text-stone-200">
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <AvatarStack characters={charactersByInitiative} currentId={currentCharacter?.id} onExpand={() => setBarExpanded(true)} />
      )}

      <div className="flex-none">
        <Button size="sm" variant={cta.variant} className={cn("font-display text-sm", cta.className)} onClick={onOpenTurn}>
          {cta.label}
        </Button>
      </div>
    </div>
  )
}
