import { appendNarrative, normalizeNarrative } from "@/lib/services/narrative-service"
import { resetAllSpells } from "@/lib/services/spell-tracking-service"
import { rollD20 } from "@/lib/utils"
import type { Turn, TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import { findEncounterInPlan } from "./advance-turn-prompt-service"

type TurnHistoryRow = {
  encounterId: string
  order?: number
}

type EncounterProgressionResult = {
  nextEncounterId: string
  narrative: string
}

export type BuildNextTurnResult =
  | {
      status: "turn_built"
      turn: Turn
      shouldProcessNpcTurns: boolean
    }
  | {
      status: "adventure_complete"
      shouldProcessNpcTurns: boolean
    }

function buildContinuingEncounterTurn(args: {
  turn: Turn
  adventureId: string
  currentEncounterTitle: string
  narrative: string
}): Turn {
  let newCharacters: TurnCharacter[] = (args.turn.characters as TurnCharacter[]).filter(
    (c) => c.status !== "dead" && c.status !== "fled"
  )
  const normalizedNarrative = normalizeNarrative(args.narrative || "")

  newCharacters = newCharacters.map((c) => ({
    ...c,
    hasReplied: false,
    isComplete: false,
    initiative: rollD20(),
  }))

  newCharacters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  return {
    id: "",
    adventureId: args.adventureId,
    encounterId: args.turn.encounterId,
    title: args.currentEncounterTitle,
    narrative: normalizedNarrative,
    characters: newCharacters,
  }
}

function buildTransitionEncounterTurn(args: {
  turn: Turn
  plan: AdventurePlan
  allTurns: TurnHistoryRow[]
  adventureId: string
  llmResult: EncounterProgressionResult
}): BuildNextTurnResult {
  const nextEncounter = findEncounterInPlan(args.plan, args.llmResult.nextEncounterId)
  let shouldProcessNpcTurns = true

  if (nextEncounter?.skipInitialNpcTurns) {
    console.log(`[advanceTurn] Skipping initial NPC turns for new encounter: ${nextEncounter.id}`)
    shouldProcessNpcTurns = false
  }

  if (!nextEncounter) {
    return { status: "adventure_complete", shouldProcessNpcTurns }
  }

  let pcs: TurnCharacter[] = (args.turn.characters as TurnCharacter[])
    .filter((c) => c.type === "pc" && c.status !== "dead" && c.status !== "fled")
    .map((pc) => ({
      ...pc,
      initiative: rollD20(),
    }))

  console.log(
    `[advanceTurn] Resetting spell usage for all PCs on encounter transition to: ${nextEncounter.id}`
  )
  pcs = resetAllSpells(pcs)

  if (nextEncounter.resetHealth) {
    console.log(
      `[advanceTurn] Resetting health for all characters due to resetHealth flag in encounter: ${nextEncounter.id}`
    )
    pcs = pcs.map((pc) => ({
      ...pc,
      healthPercent: 100,
      status: pc.status === "dead" ? "" : pc.status,
    }))
  }

  const isFirstTurnForEncounter = !args.allTurns.some(
    (previousTurn) => previousTurn.encounterId === nextEncounter.id
  )

  if (nextEncounter.skipInitialNpcTurns && isFirstTurnForEncounter) {
    console.log(
      `[advanceTurn] Setting NPC initiatives to 0 for first turn of encounter with skipInitialNpcTurns: ${nextEncounter.id}`
    )
  }

  const npcs: TurnCharacter[] = (nextEncounter.npc || []).map(
    (npcRef: { id: string; initialInitiative?: number; behavior?: string }) => {
      const npc = args.plan.npcs[npcRef.id]

      let npcInitiative: number
      if (nextEncounter.skipInitialNpcTurns && isFirstTurnForEncounter) {
        npcInitiative = 0
      } else {
        npcInitiative =
          typeof npcRef.initialInitiative === "number" ? npcRef.initialInitiative : rollD20()
      }

      return {
        ...npc,
        id: npcRef.id,
        type: "npc",
        isComplete: false,
        hasReplied: false,
        initiative: npcInitiative,
        healthPercent: 100,
        behavior: npcRef.behavior,
      }
    }
  )

  let allCharacters: TurnCharacter[] = [...pcs, ...npcs]
  allCharacters = allCharacters.map((c) => ({
    ...c,
    hasReplied: false,
    isComplete: false,
  }))
  allCharacters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  const narrative = appendNarrative(
    normalizeNarrative(args.llmResult.narrative || ""),
    normalizeNarrative(nextEncounter.intro || "")
  )

  const turn: Turn = {
    id: "",
    adventureId: args.adventureId,
    encounterId: nextEncounter.id,
    title: nextEncounter.title,
    narrative,
    characters: allCharacters,
  }

  return { status: "turn_built", turn, shouldProcessNpcTurns }
}

export function buildNextTurnFromProgression(args: {
  turn: Turn
  plan: AdventurePlan
  allTurns: TurnHistoryRow[]
  adventureId: string
  currentEncounterTitle: string
  llmResult: EncounterProgressionResult
}): BuildNextTurnResult {
  if (args.llmResult.nextEncounterId === args.turn.encounterId) {
    const turn = buildContinuingEncounterTurn({
      turn: args.turn,
      adventureId: args.adventureId,
      currentEncounterTitle: args.currentEncounterTitle,
      narrative: args.llmResult.narrative,
    })
    return { status: "turn_built", turn, shouldProcessNpcTurns: true }
  }

  return buildTransitionEncounterTurn({
    turn: args.turn,
    plan: args.plan,
    allTurns: args.allTurns,
    adventureId: args.adventureId,
    llmResult: args.llmResult,
  })
}

export function isFinalEncounterById(plan: AdventurePlan, encounterId: string): boolean {
  const encounter = findEncounterInPlan(plan, encounterId)
  return encounter ? !encounter.transitions || encounter.transitions.length === 0 : false
}
