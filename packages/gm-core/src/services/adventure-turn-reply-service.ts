import type { GmPorts } from "../ports"
import { takeAction } from "../sheet/actions"
import type { ConditionEntry } from "../sheet/condition-entry"
import { useBonusAction } from "../sheet/features"
import type { Sheet } from "../sheet/sheet"
import type { TurnEffect } from "../sheet/turn-effect"
import { authoredText } from "../story/authored"
import type { StoryBeat } from "../story/beats"
import { type StoryNames, storyNames } from "../story/render"
import { turnScript } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import type { Character } from "../types/character"
import { rollDie } from "../utils/game-utils"
import { createRollRequirementService, type TurnReading } from "./roll-requirement-service"

export function createAdventureTurnReplyService(ports: GmPorts) {
  const { readAction } = createRollRequirementService(ports)
  const isLocalWikiAdventure = ports.content.isWikiAdventure.bind(ports.content)
  const loadWikiAdventureRuntime = ports.content.loadWikiRuntime.bind(ports.content)
  async function resolveEncounterContent(settingId: string, planId: string, encounterId: string, names: StoryNames): Promise<{ encounterIntro: string; encounterInstructions: string }> {
    if (isLocalWikiAdventure(settingId, planId)) {
      const { artifacts } = await loadWikiAdventureRuntime(settingId, planId)
      const encounter = artifacts.encounters[encounterId]
      if (!encounter) {
        console.error("[processTurnReply] Wiki encounter not found for encounterId:", encounterId)
        throw new Error("Encounter not found")
      }
      return {
        encounterIntro: authoredText(encounter.sections.intro ?? encounter.sections.body ?? "", names),
        encounterInstructions: encounter.sections.gmNotes ?? "",
      }
    }

    const planPath = `settings/${settingId}/${planId}.json`
    const plan = (await ports.content.loadLegacyPlan(settingId, planId)) as AdventurePlan
    if (!plan) {
      console.error("[processTurnReply] Adventure plan not found at path:", planPath)
      throw new Error("Adventure plan not found")
    }
    const encounter = plan.sections
      .flatMap((section) => section.scenes)
      .flatMap((scene) => scene.encounters)
      .find((entry) => entry.id === encounterId)
    if (!encounter) {
      console.error("[processTurnReply] Encounter not found for encounterId:", encounterId)
      throw new Error("Encounter not found")
    }
    return { encounterIntro: encounter.intro || "", encounterInstructions: encounter.instructions || "" }
  }

  /** A hero's reply as the game master reads it: the roll it asks for, or the action it takes with no roll. */
  async function readTurnReply(args: {
    turn: {
      encounterId: string
      order?: number
      story: StoryBeat[]
      adventureId: string
      characters?: readonly {
        id: string
        name: string
        type?: "pc" | "npc"
        sheet?: Sheet
        statBlock?: string
        hitPoints?: number
        healthPercent?: number
        dead?: true
        fled?: true
        conditions?: ConditionEntry[]
        turnEffects?: TurnEffect[]
        isComplete?: boolean
      }[]
    }
    adventure: {
      settingId: string
      planId: string
    }
    characterPerformingAction: {
      name: string
      [key: string]: unknown
    }
    narrativeAction: string
    originalPlayerInput?: string
  }): Promise<TurnReading> {
    const { encounterIntro, encounterInstructions } = await resolveEncounterContent(args.adventure.settingId, args.adventure.planId, args.turn.encounterId, storyNames(args.turn.characters ?? []))

    const allTurns = await ports.store.getTurns({ adventureId: args.turn.adventureId })
    const currentTurnOrder = args.turn.order || 1

    const recentTurnNarratives = allTurns
      .filter((entry) => entry.order <= currentTurnOrder)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .slice(-3)
      .map((entry) => turnScript(entry))
      .join("\n\n---\n\n")

    const actionToAnalyze = args.originalPlayerInput?.trim() ? args.originalPlayerInput : args.narrativeAction

    console.log("[LLM] Analyzing action for roll requirement:", {
      action: actionToAnalyze,
      isOriginalInput: !!args.originalPlayerInput?.trim(),
      character: args.characterPerformingAction.name,
      encounter: args.turn.encounterId,
      recentTurnsCount: allTurns.filter((entry) => entry.order <= currentTurnOrder).length,
    })

    return readAction(actionToAnalyze, args.characterPerformingAction as Character, {
      encounterInstructions,
      narrativeContext: recentTurnNarratives || turnScript(args.turn),
      encounterIntro,
      present: args.turn.characters,
    })
  }

  /**
   * Apply what a reply did beside any roll, once the reply is stored: a Bonus Action the hero used, and an action
   * that took no roll. What they leave on the characters is written to the turn, and a Bonus Action is told in the
   * story as a beat of its own.
   */
  async function applyReading(args: { turnId: string; characterId: string; reading: TurnReading }): Promise<void> {
    const { action, bonus } = args.reading
    if (!action && !bonus) return
    const turn = await ports.store.getTurn({ turnId: args.turnId })
    if (!turn) throw new Error("Turn not found")
    let characters = turn.characters as TurnCharacter[]
    const used = bonus ? useBonusAction({ characters, actorId: args.characterId, feature: bonus.feature, target: bonus.target, roll: rollDie }) : undefined
    if (used) characters = used.characters
    const taken = action ? takeAction(characters, args.characterId, action) : undefined
    if (taken) characters = taken.characters
    console.log("[LLM] Reading applied:", { bonus: used?.use?.fact ?? "none", action: taken?.fact ?? "none" })
    if (!used?.use && !taken?.fact) return
    const told: StoryBeat[] = used?.use
      ? [
          {
            kind: "feature",
            by: { step: "reply", character: args.characterId },
            character: args.characterId,
            name: used.use.name,
            text: used.use.fact,
            ...(used.use.target ? { target: used.use.target } : {}),
            ...(used.use.harm ? { harm: used.use.harm } : {}),
          },
        ]
      : []
    await ports.store.updateTurn({ turnId: args.turnId, patch: { characters, ...(told.length ? { story: [...turn.story, ...told] } : {}), updatedAt: Date.now() } })
  }
  return { readTurnReply, applyReading }
}
