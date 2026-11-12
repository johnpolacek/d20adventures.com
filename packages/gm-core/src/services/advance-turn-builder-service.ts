import { conditionsAtEncounterEnd } from "../sheet/conditions"
import { atRoundStart, revived } from "../sheet/death"
import { withHitPoints, withStartingHitPoints } from "../sheet/hit-points"
import { authoredStory } from "../story/authored"
import type { StoryBeat } from "../story/beats"
import { cleanStory } from "../story/clean"
import type { Turn, TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import { rollD20 } from "../utils/game-utils"
import { hasFled, isDead } from "../utils/turn-actors"
import { findEncounterInPlan } from "./advance-turn-prompt-service"
import { resetAllSpells } from "./spell-tracking-service"

type TurnHistoryRow = {
  encounterId: string
  order?: number
}

type EncounterProgressionResult = {
  nextEncounterId: string
  // The GM's beats for the round's end.
  story: StoryBeat[]
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

function buildContinuingEncounterTurn(args: { turn: Turn; adventureId: string; currentEncounterTitle: string; story: StoryBeat[] }): Turn {
  let newCharacters: TurnCharacter[] = (args.turn.characters as TurnCharacter[]).filter((c) => !isDead(c) && !hasFled(c))

  // Last round's rolls are over. Initiative was rolled as the encounter began, and every round keeps that order. A
  // dying hero's turn is their Death Saving Throw.
  newCharacters = newCharacters.map(({ rollResult: _rollResult, ...c }) => atRoundStart(c))

  newCharacters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  return {
    id: "",
    adventureId: args.adventureId,
    encounterId: args.turn.encounterId,
    title: args.currentEncounterTitle,
    story: args.story,
    characters: newCharacters,
  }
}

function buildTransitionEncounterTurn(args: { turn: Turn; plan: AdventurePlan; allTurns: TurnHistoryRow[]; adventureId: string; llmResult: EncounterProgressionResult }): BuildNextTurnResult {
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
    .filter((c) => c.type === "pc" && !isDead(c) && !hasFled(c))
    .map(({ rollResult: _rollResult, ...pc }) => ({
      ...pc,
      initiative: rollD20(),
    }))

  console.log(`[advanceTurn] Resetting spell usage for all PCs on encounter transition to: ${nextEncounter.id}`)
  pcs = resetAllSpells(pcs)
  // A new encounter comes later: the conditions of a fight's moment are over, and lasting ones stay.
  pcs = pcs.map(conditionsAtEncounterEnd)

  if (nextEncounter.resetHealth) {
    console.log(`[advanceTurn] Resetting health for all characters due to resetHealth flag in encounter: ${nextEncounter.id}`)
    // Back to its maximum: withHitPoints clamps to it. A hero at 0 wakes.
    pcs = pcs.map((pc) => (pc.hitPoints === 0 ? revived(pc, Number.POSITIVE_INFINITY) : withHitPoints(pc, Number.POSITIVE_INFINITY)))
  }

  const isFirstTurnForEncounter = !args.allTurns.some((previousTurn) => previousTurn.encounterId === nextEncounter.id)

  if (nextEncounter.skipInitialNpcTurns && isFirstTurnForEncounter) {
    console.log(`[advanceTurn] Setting NPC initiatives to 0 for first turn of encounter with skipInitialNpcTurns: ${nextEncounter.id}`)
  }

  const npcs: TurnCharacter[] = (nextEncounter.npc || []).map((npcRef: { id: string; initialInitiative?: number; behavior?: string }) => {
    const npc = args.plan.npcs[npcRef.id]

    let npcInitiative: number
    if (nextEncounter.skipInitialNpcTurns && isFirstTurnForEncounter) {
      npcInitiative = 0
    } else {
      npcInitiative = typeof npcRef.initialInitiative === "number" ? npcRef.initialInitiative : rollD20()
    }

    return withStartingHitPoints({
      ...npc,
      id: npcRef.id,
      type: "npc" as const,
      isComplete: false,
      hasReplied: false,
      initiative: npcInitiative,
      behavior: npcRef.behavior,
    })
  })

  let allCharacters: TurnCharacter[] = [...pcs, ...npcs]
  allCharacters = allCharacters.map(atRoundStart)
  allCharacters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))

  const intro = cleanStory(authoredStory(nextEncounter.intro || "", { cast: allCharacters }), { cast: allCharacters }, { step: "intro" })

  const turn: Turn = {
    id: "",
    adventureId: args.adventureId,
    encounterId: nextEncounter.id,
    title: nextEncounter.title,
    story: [...args.llmResult.story, ...intro],
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
      story: args.llmResult.story,
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
