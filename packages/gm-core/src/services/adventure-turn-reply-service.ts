import type { GmPorts } from "../ports"
import { takeAction } from "../sheet/actions"
import { checkBonus } from "../sheet/check"
import type { ConditionEntry } from "../sheet/condition-entry"
import { costWhenCountered, reactionsToCast } from "../sheet/counterspell"
import { afterHarm } from "../sheet/death"
import { hasFeature, withFeatureUsed } from "../sheet/feature-rules"
import { useBonusAction } from "../sheet/features"
import { moveWithReactions, ordered } from "../sheet/reactions"
import { partyRest, restName } from "../sheet/rest"
import type { Sheet } from "../sheet/sheet"
import { speedOf } from "../sheet/space"
import { settleConcentration } from "../sheet/spell-effects"
import { castInSpace } from "../sheet/spell-space"
import { againOf, castAgain, castCost, castSpell, spellById, withCastSpent } from "../sheet/spells"
import type { TurnEffect } from "../sheet/turn-effect"
import { authoredText } from "../story/authored"
import type { StoryBeat } from "../story/beats"
import { type StoryNames, storyNames } from "../story/render"
import { attackBeat, castAnswerBeats, castBeats, concentrationBeat, turnScript } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import type { Character } from "../types/character"
import { rollD20, rollDie } from "../utils/game-utils"
import { hasFled, isDead, isDown } from "../utils/turn-actors"
import { createRollRequirementService, type TurnReading } from "./roll-requirement-service"

/**
 * Whether a move draws no Opportunity Attacks by Tactical Shift: a Fighter of level 5 who uses Second Wind as their
 * Bonus Action may move up to half their Speed without drawing them.
 */
function tacticalShift(character: TurnCharacter | undefined, bonus: string | undefined, feet: number): boolean {
  if (!character || bonus !== "fighter-second-wind" || !hasFeature(character, "fighter-tactical-shift")) return false
  return feet <= Math.floor((speedOf(character) ?? 0) / 2)
}

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
    const { action, bonus, move, ruling, rest, surge } = args.reading
    if (!action && !bonus && !move && !ruling && !rest && !surge) return {}
    const turn = await ports.store.getTurn({ turnId: args.turnId })
    if (!turn) throw new Error("Turn not found")
    // The move comes first: the hero stands where it took them before anything else of the turn is resolved. Those
    // whose reach it leaves may strike as it does, each by their standing order at once, and so may the hero answer
    // them. One who took the Disengage action draws no such attack.
    let characters = turn.characters as TurnCharacter[]
    const leaving: StoryBeat[] = []
    // Action Surge's use is spent as the turn is taken: the attack the reading asked for already counts its action.
    if (surge) characters = characters.map((character) => (character.id === args.characterId ? withFeatureUsed(character, "fighter-action-surge") : character))
    if (move) {
      const by = { step: "reply" as const, character: args.characterId }
      const went = moveWithReactions({
        characters,
        moverId: args.characterId,
        path: move.path,
        // The Disengage action, Cunning Action's, or Tactical Shift's half Speed taken with Second Wind.
        disengaged:
          action?.action === "disengage" ||
          bonus?.feature === "cunning-action-disengage" ||
          tacticalShift(
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
    // A spell they hold is used again with no cost (Spiritual Weapon's attack). One cast is measured where the hero now
    // stands, may be countered by the other side, and Magic Missile may draw Shield, each by their standing order.
    const actor = characters.find((character) => character.id === args.characterId)
    const spell = bonus ? spellById.get(bonus.feature) : undefined
    const again = spell && actor ? againOf(actor).find((entry) => entry.spell.id === spell.id) : undefined
    const cost = spell && actor && !again ? castCost(actor, spell.id) : undefined
    let spellBeats: StoryBeat[] = []
    if (spell && actor && (again || (cost && !("problem" in cost)))) {
      const names = storyNames(turn.characters)
      const castBy = { step: "reply" as const, character: actor.id }
      const everyone = characters.filter((character) => !isDead(character) && !hasFled(character))
      // Who it is cast on: those named, or for a spell attack the only foe here, and otherwise the caster.
      const foes = everyone.filter((character) => character.type !== actor.type && !isDown(character))
      const named = bonus?.targets ?? (bonus?.target ? [bonus.target] : spell.attack ? (foes.length === 1 ? [foes[0].id] : []) : [actor.id])
      const floor = again?.spell.id === "spiritual-weapon" ? undefined : await ports.content.floor?.(turn.encounterId)
      const spaced = floor ? castInSpace({ spell, caster: actor, everyone, named, floor }) : undefined
      if (spaced?.problem || !named.length) {
        const problem = spaced?.problem ?? { name: "No One To Cast On", text: `${actor.name} has no one to cast ${spell.name} on.` }
        spellBeats = [{ kind: "feature", by: castBy, character: actor.id, name: problem.name, text: problem.text }]
      } else {
        const targets = spaced?.targets ?? named
        const answered =
          cost && !("problem" in cost)
            ? reactionsToCast({
                characters,
                casterId: actor.id,
                spell,
                targets,
                ask: (offer) => ordered(characters.find((character) => character.id === offer.to)?.standingOrders, offer.id, offer.matters),
                d20: rollD20,
                roll: rollDie,
              })
            : undefined
        if (answered) characters = answered.characters
        const reacted = answered ? castAnswerBeats(castBy, answered, names) : []
        if (answered?.countered && cost && !("problem" in cost)) {
          characters = characters.map((character) => (character.id === actor.id ? withCastSpent(character, costWhenCountered(cost.cost)) : character))
          spellBeats = reacted
        } else {
          const how = {
            characters,
            casterId: actor.id,
            targets,
            d20: rollD20,
            roll: rollDie,
            ...(spaced && Object.keys(spaced.cover).length ? { cover: spaced.cover } : {}),
            ...(spaced?.measured ? { measured: true } : {}),
          }
          // Cast at the slot it spends: a Healing Word from a level 2 slot heals as a level 2 casting.
          const level = cost && !("problem" in cost) && cost.cost.kind === "slot" ? cost.cost.level : undefined
          const cast = again ? castAgain({ ...how, spellId: spell.id }) : castSpell({ ...how, spell, level })
          const spent = cast.characters.map((character) => (character.id === actor.id && cost && !("problem" in cost) ? withCastSpent(character, cost.cost) : character))
          // A caster the spell hurt saves to keep Concentration.
          const kept = settleConcentration({ before: characters, after: spent.map(afterHarm), bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }), d20: rollD20 })
          characters = kept.characters
          spellBeats = [...reacted, ...castBeats(castBy, actor, spell, cast, names), ...kept.saves.map((save) => concentrationBeat(castBy, save, names))]
        }
      }
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
    const surged: StoryBeat[] = surge
      ? [
          {
            kind: "feature",
            by: { step: "reply", character: args.characterId },
            character: args.characterId,
            name: "Action Surge",
            text: `${actor?.name ?? "The Fighter"} pushes past their limits with Action Surge: one more action this turn.`,
          },
        ]
      : []
    if (!used?.use && !taken?.fact && !spellBeats.length && !move && !ruling && !resting && !surge) return {}
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
    const told = [...leaving, ...surged, ...feature, ...ruled, ...restBeats]
    await ports.store.updateTurn({ turnId: args.turnId, patch: { characters, ...(told.length ? { story: [...turn.story, ...told] } : {}), updatedAt: Date.now() } })
    return {}
  }
  return { readTurnReply, applyReading }
}
