import type { GmPorts } from "../ports"
import { takeAction } from "../sheet/actions"
import { checkBonus } from "../sheet/check"
import { choiceRule, classConcentrationModes, type Featured } from "../sheet/class-rules"
import type { ConditionEntry } from "../sheet/condition-entry"
import { afterHarm } from "../sheet/death"
import { bonusDisengages } from "../sheet/features"
import { moveWithReactions, ordered } from "../sheet/reactions"
import { partyRest, restName } from "../sheet/rest"
import type { Sheet } from "../sheet/sheet"
import { settleConcentration } from "../sheet/spell-effects"
import type { TurnEffect } from "../sheet/turn-effect"
import { authoredText } from "../story/authored"
import type { StoryBeat } from "../story/beats"
import { type StoryNames, storyNames } from "../story/render"
import { attackBeat, concentrationBeat, turnScript } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import type { Character } from "../types/character"
import { rollD20, rollDie } from "../utils/game-utils"
import { useBonus } from "./bonus-action"
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
        position?: { x: number; y: number }
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
      floor: await ports.content.floor?.(args.turn.encounterId),
    })
  }

  /**
   * Apply what a reply did beside any roll, once the reply is stored: a Bonus Action the hero used, and an action
   * that took no roll. What they leave on the characters is written to the turn, and a Bonus Action is told in the
   * story as a beat of its own. `fell` says an Opportunity Attack dropped the hero as they moved: the rest of their
   * turn is lost.
   */
  async function applyReading(args: { turnId: string; characterId: string; reading: TurnReading }): Promise<{ fell?: true }> {
    const { action, bonus, move, ruling, rest, choices } = args.reading
    if (!action && !bonus && !move && !ruling && !rest && !choices) return {}
    const turn = await ports.store.getTurn({ turnId: args.turnId })
    if (!turn) throw new Error("Turn not found")
    // The move comes first: the hero stands where it took them before anything else of the turn is resolved. Those
    // whose reach it leaves may strike as it does, each by their standing order at once, and so may the hero answer
    // them. One who took the Disengage action draws no such attack.
    let characters = turn.characters as TurnCharacter[]
    const leaving: StoryBeat[] = []
    // A class's choices taken with the turn are applied as it is taken: Action Surge's use is spent, and the attack the
    // reading asked for already counts its action.
    const chose: StoryBeat[] = []
    for (const key of Object.keys(choices ?? {})) {
      const applied = choiceRule(key)?.apply?.(characters as Featured[], args.characterId)
      if (!applied) continue
      characters = applied.characters as TurnCharacter[]
      if (applied.told) chose.push({ kind: "feature", by: { step: "reply", character: args.characterId }, character: args.characterId, name: applied.told.name, text: applied.told.text })
    }
    if (move) {
      const by = { step: "reply" as const, character: args.characterId }
      const went = moveWithReactions({
        characters,
        moverId: args.characterId,
        path: move.path,
        // The Disengage action, or a Bonus Action that moves without drawing them: Cunning Action's, or Tactical
        // Shift's half Speed taken with Second Wind.
        disengaged:
          action?.action === "disengage" ||
          bonusDisengages(
            characters.find((character) => character.id === args.characterId),
            bonus?.feature,
            move.feet
          ),
        ask: (offer) => ordered(characters.find((character) => character.id === offer.to)?.standingOrders, offer.id, offer.matters),
        d20: rollD20,
        roll: rollDie,
      })
      const mover = characters.find((character) => character.id === args.characterId)
      // A caster the blows hurt saves to keep Concentration, and one they dropped loses it.
      const kept = settleConcentration({
        before: characters,
        after: went.characters.map(afterHarm),
        bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
        modes: classConcentrationModes,
        d20: rollD20,
      })
      characters = kept.characters
      for (const made of went.attacks) {
        const attacker = characters.find((character) => character.id === made.attacker)
        if (!attacker || !mover) continue
        leaving.push(
          { kind: "feature", by, character: attacker.id, name: "Opportunity Attack", text: `${attacker.name} strikes as ${mover.name} leaves their reach.`, target: mover.id },
          ...made.reactions.map((taken): StoryBeat => ({ kind: "feature", by, character: taken.by, name: taken.name, text: taken.text })),
          attackBeat(by, attacker, mover.id, made.blow)
        )
      }
      // What the areas on the floor did to the hero as they walked (../sheet/spell-rounds `areasWalked`).
      leaving.push(...went.told.map((fact): StoryBeat => ({ kind: "feature", by, character: fact.character, name: fact.spell, text: fact.text })))
      leaving.push(...kept.saves.map((save) => concentrationBeat(by, save, storyNames(turn.characters))))
      // A hero the blow dropped does nothing more this turn: what they meant to do is lost, and any roll with it.
      if (went.stopped) {
        await ports.store.updateTurn({ turnId: args.turnId, patch: { characters, story: [...turn.story, ...leaving], updatedAt: Date.now() } })
        return { fell: true }
      }
    }
    // A Bonus Action: a feature of the hero's, or one of their spells that takes one, used by the one path an NPC's
    // takes too (./bonus-action). Those the spell may draw a reaction from answer by their standing order at once.
    const used = bonus
      ? await useBonus({
          characters,
          actorId: args.characterId,
          bonus,
          floor: async () => ports.content.floor?.(turn.encounterId),
          ask: (offer) => ordered(characters.find((character) => character.id === offer.to)?.standingOrders, offer.id, offer.matters),
          d20: rollD20,
          roll: rollDie,
          by: { step: "reply", character: args.characterId },
          names: storyNames(turn.characters),
        })
      : undefined
    if (used) characters = used.characters
    const taken = action ? takeAction(characters, args.characterId, action) : undefined
    if (taken) characters = taken.characters
    console.log("[LLM] Reading applied:", { bonus: used?.fact ?? "none", action: taken?.fact ?? "none", move: move ?? "none", ruling: ruling?.text ?? "none" })
    // A rest is the whole party's: every hero takes it, and each one's gains are told as an entry of their own.
    const resting = rest ? partyRest(characters, rest, rollDie) : undefined
    if (resting) characters = resting.characters
    const restBeats: StoryBeat[] = (resting?.rested ?? []).map(({ id, facts }) => ({
      kind: "feature",
      by: { step: "reply", character: args.characterId },
      character: id,
      name: restName(rest ?? "short"),
      text: facts.join(" "),
    }))
    if (!used?.beats.length && !taken?.fact && !move && !ruling && !resting && !choices) return {}
    // What the rules of space would not allow is told as an entry of its own, so the story does not keep an attack that was never made.
    const ruled: StoryBeat[] = ruling ? [{ kind: "feature", by: { step: "reply", character: args.characterId }, character: args.characterId, name: ruling.name, text: ruling.text }] : []
    const feature: StoryBeat[] = used?.beats ?? []
    const told = [...leaving, ...chose, ...feature, ...ruled, ...restBeats]
    await ports.store.updateTurn({ turnId: args.turnId, patch: { characters, ...(told.length ? { story: [...turn.story, ...told] } : {}), updatedAt: Date.now() } })
    return {}
  }
  return { readTurnReply, applyReading }
}
