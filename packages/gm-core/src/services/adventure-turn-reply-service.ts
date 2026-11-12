import type { GmPorts } from "../ports"
import { takeAction } from "../sheet/actions"
import { checkBonus } from "../sheet/check"
import type { ConditionEntry } from "../sheet/condition-entry"
import { afterHarm } from "../sheet/death"
import { useBonusAction } from "../sheet/features"
import { moveWithReactions, ordered } from "../sheet/reactions"
import { partyRest, restName } from "../sheet/rest"
import type { Sheet } from "../sheet/sheet"
import { settleConcentration } from "../sheet/spell-effects"
import { castCost, castSpell, spellById, withCastSpent } from "../sheet/spells"
import type { TurnEffect } from "../sheet/turn-effect"
import { authoredText } from "../story/authored"
import type { StoryBeat } from "../story/beats"
import { type StoryNames, storyNames } from "../story/render"
import { attackBeat, castBeats, concentrationBeat, turnScript } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import type { Character } from "../types/character"
import { rollD20, rollDie } from "../utils/game-utils"
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
    const { action, bonus, move, ruling, rest } = args.reading
    if (!action && !bonus && !move && !ruling && !rest) return {}
    const turn = await ports.store.getTurn({ turnId: args.turnId })
    if (!turn) throw new Error("Turn not found")
    // The move comes first: the hero stands where it took them before anything else of the turn is resolved. Those
    // whose reach it leaves may strike as it does, each by their standing order at once, and so may the hero answer
    // them. One who took the Disengage action draws no such attack.
    let characters = turn.characters as TurnCharacter[]
    const leaving: StoryBeat[] = []
    if (move) {
      const by = { step: "reply" as const, character: args.characterId }
      const went = moveWithReactions({
        characters,
        moverId: args.characterId,
        path: move.path,
        disengaged: action?.action === "disengage",
        ask: (offer) => ordered(characters.find((character) => character.id === offer.to)?.standingOrders, offer.id, offer.matters),
        d20: rollD20,
        roll: rollDie,
      })
      const mover = characters.find((character) => character.id === args.characterId)
      // A caster the blows hurt saves to keep Concentration, and one they dropped loses it.
      const kept = settleConcentration({ before: characters, after: went.characters.map(afterHarm), bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }), d20: rollD20 })
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
      leaving.push(...kept.saves.map((save) => concentrationBeat(by, save, storyNames(turn.characters))))
      // A hero the blow dropped does nothing more this turn: what they meant to do is lost, and any roll with it.
      if (went.stopped) {
        await ports.store.updateTurn({ turnId: args.turnId, patch: { characters, story: [...turn.story, ...leaving], updatedAt: Date.now() } })
        return { fell: true }
      }
    }
    // A Bonus Action is a class feature of the hero's, or one of their spells that takes one. The spell is cast by
    // the same rules as any other, and the story keeps it with no telling of its own: the turn's action is told after.
    const actor = characters.find((character) => character.id === args.characterId)
    const spell = bonus ? spellById.get(bonus.feature) : undefined
    const cost = spell && actor ? castCost(actor, spell.id) : undefined
    let spellBeats: StoryBeat[] = []
    if (spell && actor && cost && !("problem" in cost)) {
      const cast = castSpell({ characters, casterId: actor.id, spell, targets: [bonus?.target ?? actor.id], d20: rollD20, roll: rollDie })
      characters = cast.characters.map((character) => (character.id === actor.id ? withCastSpent(character, cost.cost) : character))
      spellBeats = castBeats({ step: "reply", character: actor.id }, actor, spell, cast, storyNames(turn.characters))
    }
    const used = bonus && !spell ? useBonusAction({ characters, actorId: args.characterId, feature: bonus.feature, target: bonus.target, roll: rollDie }) : undefined
    if (used) characters = used.characters
    const taken = action ? takeAction(characters, args.characterId, action) : undefined
    if (taken) characters = taken.characters
    console.log("[LLM] Reading applied:", { bonus: used?.use?.fact ?? "none", action: taken?.fact ?? "none", move: move ?? "none", ruling: ruling?.text ?? "none" })
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
    if (!used?.use && !taken?.fact && !spellBeats.length && !move && !ruling && !resting) return {}
    // What the rules of space would not allow is told as an entry of its own, so the story does not keep an attack that was never made.
    const ruled: StoryBeat[] = ruling ? [{ kind: "feature", by: { step: "reply", character: args.characterId }, character: args.characterId, name: ruling.name, text: ruling.text }] : []
    const feature: StoryBeat[] = spellBeats.length
      ? spellBeats
      : used?.use
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
    const told = [...leaving, ...feature, ...ruled, ...restBeats]
    await ports.store.updateTurn({ turnId: args.turnId, patch: { characters, ...(told.length ? { story: [...turn.story, ...told] } : {}), updatedAt: Date.now() } })
    return {}
  }
  return { readTurnReply, applyReading }
}
