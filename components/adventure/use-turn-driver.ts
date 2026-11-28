"use client"

import { useEffect, useRef } from "react"
import { ensureNpcProcessed } from "@/app/_actions/ensure-npc-processed"
import type { Id } from "@/convex/_generated/dataModel"
import { findCurrentActor, hasPendingAutonomousAction } from "@/lib/utils/turn-actors"
import type { Turn } from "@/types/adventure"
import { controlsHero } from "./turn-reaction"

type DriverPhase =
  | { kind: "idle" }
  | { kind: "awaiting_reaction"; turnId: string; offerKey: string; expiresAt: number; mine: boolean }
  | { kind: "processing_npc"; turnId: string; actorKey: string; actorId: string; actorName: string }

function deriveDriverPhase(turn: Turn | null, disableSSE: boolean, userId: string | undefined): DriverPhase {
  if (disableSSE || !turn || turn.isFinalEncounter) return { kind: "idle" }
  const reaction = turn.reaction
  if (reaction) {
    if (reaction.answer === undefined) {
      const offerMine = controlsHero(
        turn.characters.find((c) => c.id === reaction.offer.to),
        userId
      )
      return {
        kind: "awaiting_reaction",
        turnId: turn.id,
        offerKey: `${turn.id}:${reaction.npc}:${reaction.expiresAt}`,
        expiresAt: reaction.expiresAt,
        mine: offerMine,
      }
    }
    return { kind: "idle" }
  }
  const actor = findCurrentActor(turn.characters ?? [])
  if (actor && hasPendingAutonomousAction(actor)) {
    return {
      kind: "processing_npc",
      turnId: turn.id,
      actorKey: `${turn.id}:${actor.id}`,
      actorId: actor.id,
      actorName: actor.name,
    }
  }
  return { kind: "idle" }
}

/**
 * Single client driver for autonomous NPC/AI turns and expired reaction-offer nudges.
 * Replaces duplicated `ensureNpcProcessed` effects across `TurnNarrative` and `AdventureHomeContent`.
 */
export function useTurnDriver({ turn, disableSSE, userId }: { turn: Turn | null; disableSSE: boolean; userId: string | undefined }) {
  const phase = deriveDriverPhase(turn, disableSSE, userId)
  const triggeredActorRef = useRef<string | null>(null)

  const phaseKey =
    phase.kind === "processing_npc"
      ? `npc:${phase.actorKey}`
      : phase.kind === "awaiting_reaction"
        ? `reaction:${phase.offerKey}:${phase.mine ? "1" : "0"}`
        : "idle"

  useEffect(() => {
    if (phase.kind === "idle") {
      triggeredActorRef.current = null
      return
    }

    if (phase.kind === "processing_npc") {
      if (triggeredActorRef.current === phase.actorKey) return
      triggeredActorRef.current = phase.actorKey
      console.log("[useTurnDriver] Triggering ensureNpcProcessed:", {
        turnId: phase.turnId,
        actorId: phase.actorId,
        actorName: phase.actorName,
      })
      ensureNpcProcessed(phase.turnId as Id<"turns">).catch((error) => {
        console.error("[useTurnDriver] Error calling ensureNpcProcessed:", error)
      })
      return
    }

    // phase.kind === "awaiting_reaction": once the offer expires unanswered, nudge the server to play on.
    let live = true
    let tries = phase.mine ? 3 : 1
    let timer: ReturnType<typeof setTimeout> | undefined
    const nudge = () => {
      if (!live || tries-- <= 0) return
      ensureNpcProcessed(phase.turnId as Id<"turns">)
        .catch((error) => console.error("[useTurnDriver] Error playing on after a reaction ran out:", error))
        .finally(() => {
          if (live && tries > 0) timer = setTimeout(nudge, 3000)
        })
    }
    timer = setTimeout(nudge, Math.max(0, phase.expiresAt - Date.now()) + (phase.mine ? 1000 : 8000))
    return () => {
      live = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey])
}
