import type { GmPorts } from "../ports"
import { afterRoll, takeAction } from "../sheet/actions"
import { multiattackOf, strikeFacts } from "../sheet/attack"
import { checkBonus, resolveCheck } from "../sheet/check"
import { saveFailedBy } from "../sheet/conditions"
import { afterHarm, killed } from "../sheet/death"
import { d20sOf, replaying } from "../sheet/dice"
import { applyStakes } from "../sheet/harm"
import { type Ask, attackWithReactions, moveWithReactions, ordered, type ReactionTaken } from "../sheet/reactions"
import { checkAdds, settleConcentration } from "../sheet/spell-effects"
import { castCost, castSpell, isEngineSpell, spellById, withCastSpent } from "../sheet/spells"
import type { StoryBeat, StoryBy, StoryOutput } from "../story/beats"
import { cleanStory, type StoryScene } from "../story/clean"
import { storyNames } from "../story/render"
import { attackBeat, castBeats, concentrationBeat, rollBeat, turnScript } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import { isDown } from "../utils/turn-actors"
import { isAttackRoll, isCastRoll } from "../validations/roll-requirement-schema"
import type { SafetyRules } from "../wiki-adventures/player-safety"
import { buildNpcOutcomePrompt, createNpcTurnGenerationService } from "./npc-turn-generation-service"
import { applyNpcEffectsToCharacters, type NpcTurnEffect } from "./npc-turn-resolution-service"
import { ReactionPending } from "./reaction-pending"
import { createRollRequirementService, type TurnReading } from "./roll-requirement-service"

export type NpcRollInfo = {
  rollType: string
  difficulty: number
  baseRoll: number
  modifier: number
  result: number
  success: boolean
}

export type NpcTurnBranchResult = {
  updatedCharacters: TurnCharacter[]
  actionSummary: string
  rollInfo?: NpcRollInfo
  effects?: NpcTurnEffect[]
  beatsToAppend: StoryBeat[]
}

type NpcActionResult = {
  actionSummary: string
  beats: StoryOutput
  actionType: "attack" | "skill" | "skip" | "pass" | "flee" | "die" | "other"
  effects?: NpcTurnEffect[]
}

// An NPC turn that needs no roll and touches nobody else: waiting, holding back, running away for good, or dying.
export function handleSkipPassNpcTurn(args: { turn: Turn; npc: TurnCharacter; actionResult: NpcActionResult; scene: StoryScene }): NpcTurnBranchResult {
  const beatsToAppend = cleanStory(args.actionResult.beats, args.scene, npcStep(args.npc))
  const updatedCharacters = args.turn.characters.map((character) => {
    if (character.id === args.npc.id) {
      // Skipping or passing changes nothing about the NPC. One who flees is out of the
      // encounter: the next round is built without them. One who dies is dead for good. Thaddeus died of poison on his
      // own turn at 65% health, then sagged to one knee, gasping, in the next roll's outcome.
      const done = { ...character, hasReplied: true, isComplete: true }
      if (args.actionResult.actionType === "die") return killed(done)
      return args.actionResult.actionType === "flee" ? { ...done, fled: true as const } : done
    }
    return character
  })

  console.log("[LLM] NPC turn completed:", {
    action: args.actionResult.actionType,
    npc: args.npc.name,
  })

  return {
    updatedCharacters,
    actionSummary: args.actionResult.actionSummary,
    rollInfo: undefined,
    effects: undefined,
    beatsToAppend,
  }
}

const npcStep = (npc: TurnCharacter): StoryBy => ({ step: "npc", character: npc.id })

export function createNpcTurnBranchService(ports: GmPorts) {
  const { generateNpcOutcome } = createNpcTurnGenerationService(ports)
  const { readAction } = createRollRequirementService(ports)
  async function resolveNpcTurnRollOrDirectBranch(args: {
    turn: Turn
    npc: TurnCharacter
    actionResult: NpcActionResult
    encounterContext?: { intro?: string; instructions?: string }
    npcActionContext: {
      contextString: string
      npcDetails: string
      playerCharacters: TurnCharacter[]
    }
    scene: StoryScene
    // The adventure's rules: with `playerDeath: false` a hero this NPC would kill is left Stable instead.
    rules?: SafetyRules
    // The turn played again after a reaction was answered: how the move was read, the dice it rolled, and the answers
    // given so far. Everything up to the last answer then falls as it fell before.
    resume?: { reading: TurnReading; dice: number[]; answers: boolean[] }
  }): Promise<Omit<NpcTurnBranchResult, "actionSummary">> {
    let beatsToAppend: StoryBeat[] = []
    const script = turnScript(args.turn)
    let updatedCharacters = [...args.turn.characters]
    let rollInfo: NpcRollInfo | undefined
    let effects: NpcTurnEffect[] | undefined

    const reading =
      args.resume?.reading ??
      (await readAction(args.actionResult.actionSummary, args.npc, {
        encounterInstructions: args.encounterContext?.instructions || "",
        encounterIntro: args.encounterContext?.intro || "",
        narrativeContext: script,
        present: args.turn.characters,
        floor: await ports.content.floor?.(args.turn.encounterId),
      }))
    const rollRequirement = reading.roll
    // The turn's dice are kept, so the turn can be played again the same after a player answers a reaction.
    const dice = replaying(args.resume?.dice)
    const answers = args.resume?.answers ?? []
    let answered = 0
    // How a reaction offered in this turn is answered. An NPC and an AI companion follow their standing order at once,
    // and so does a hero whose order refuses it or to whom it would make no difference. Any other hero's player is
    // asked: the answers already in are taken in order, and at the first one missing the turn stops here to wait.
    const ask: Ask = (offer, text) => {
      const reactor = updatedCharacters.find((character) => character.id === offer.to)
      const order = ordered(reactor?.standingOrders, offer.id, offer.matters)
      if (!reactor || reactor.type !== "pc" || reactor.controlledBy === "ai" || !order || !offer.matters) return order
      if (answered < answers.length) return answers[answered++]
      throw new ReactionPending(offer, text, { reading, dice: [...dice.log], answers: [...answers] })
    }
    const told = (taken: ReactionTaken): StoryBeat => ({ kind: "feature", by: npcStep(args.npc), character: taken.by, name: taken.name, text: taken.text })
    // The move comes first, and those whose reach it leaves may strike as it does. The NPC stands where the move took
    // it, or where a blow dropped it, before the rest of the turn is resolved.
    const leaving: StoryBeat[] = []
    const leavingFacts: string[] = []
    if (reading.move) {
      const went = moveWithReactions({
        characters: updatedCharacters,
        moverId: args.npc.id,
        path: reading.move.path,
        disengaged: reading.action?.action === "disengage",
        ask,
        d20: dice.d20,
        roll: dice.roll,
        rules: args.rules,
      })
      updatedCharacters = went.characters.map(afterHarm)
      for (const made of went.attacks) {
        const attacker = updatedCharacters.find((character) => character.id === made.attacker)
        if (!attacker) continue
        leaving.push(
          { kind: "feature", by: npcStep(args.npc), character: attacker.id, name: "Opportunity Attack", text: `${attacker.name} strikes as ${args.npc.name} leaves their reach.`, target: args.npc.id },
          ...made.reactions.map(told),
          attackBeat(npcStep(args.npc), attacker, args.npc.id, made.blow)
        )
        leavingFacts.push(
          `${attacker.name} makes an Opportunity Attack as ${args.npc.name} moves away. ${strikeFacts(attacker.name, args.npc.name, made.blow)}`,
          ...made.reactions.map((taken) => taken.text)
        )
      }
      // An NPC the blow dropped does nothing more: its turn is the fall.
      if (went.stopped) {
        console.log("[LLM] NPC dropped by an Opportunity Attack:", leavingFacts)
        return { updatedCharacters, rollInfo: undefined, effects: undefined, beatsToAppend: leaving }
      }
    }

    console.log("[LLM] NPC roll requirement:", {
      requiresRoll: !!rollRequirement,
      rollType: rollRequirement?.rollType,
      difficulty: rollRequirement?.difficulty,
    })

    // A spell of the NPC's stat block: one with a spell attack came back as a roll, and any other as a cast to resolve.
    const casting = reading.cast ?? (isCastRoll(rollRequirement) ? rollRequirement : undefined)
    if (casting) {
      // The engine resolves it by the spell's typed data and spends the stat block's count for it. The NPC's spell
      // attack and every target's saving throw are rolled here, a hero's too.
      const spell = spellById.get(casting.cast.spell)
      const cost = spell && castCost(args.npc, spell.id)
      if (!spell || !cost || "problem" in cost) throw new Error(cost && "problem" in cost ? cost.problem : `"${casting.cast.spell}" is not a spell.`)
      const cast = castSpell({
        characters: updatedCharacters,
        casterId: args.npc.id,
        spell,
        targets: casting.cast.targets,
        ...(spell.attack ? { attackDice: d20sOf(dice, casting.mode) } : {}),
        mode: casting.mode,
        d20: dice.d20,
        roll: dice.roll,
        rules: args.rules,
        damageType: casting.cast.damageType,
        skill: casting.cast.skill,
        level: casting.cast.level,
        cover: casting.cast.cover,
        measured: casting.cast.measured,
      })
      const spent = cast.characters.map((character) => (character.id === args.npc.id ? withCastSpent(character, cost.cost) : character))
      const kept = settleConcentration({
        before: args.turn.characters,
        after: afterRoll(spent, args.npc.id, casting),
        bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
        d20: dice.d20,
      })
      updatedCharacters = kept.characters.map((character) => afterHarm(character))
      const thrown = cast.attack?.roll
      if (thrown) rollInfo = { rollType: spell.name, difficulty: thrown.armorClass, baseRoll: thrown.natural, modifier: thrown.bonus, result: thrown.total, success: thrown.hit }
      const facts = [...cast.facts, ...kept.facts]
      console.log("[LLM] NPC casts:", { spell: spell.id, targets: casting.cast.targets, facts })
      const outcomeResult = await generateNpcOutcome(
        buildNpcOutcomePrompt({
          contextString: args.npcActionContext.contextString,
          npcDetails: args.npcActionContext.npcDetails,
          playerCharacters: args.npcActionContext.playerCharacters,
          npcName: args.npc.name,
          actionSummary: args.actionResult.actionSummary,
          rollType: spell.name,
          result: thrown?.total ?? 0,
          difficulty: casting.difficulty,
          success: thrown ? thrown.hit : true,
          scene: args.scene,
          spell: { name: spell.name, facts, ...(isEngineSpell(spell) ? {} : { text: spell.description }) },
        }),
        args.npc.id
      )
      const names = storyNames(args.turn.characters)
      beatsToAppend = [
        ...castBeats(npcStep(args.npc), args.npc, spell, cast, names),
        ...kept.saves.map((save) => concentrationBeat(npcStep(args.npc), save, names)),
        ...cleanStory(outcomeResult.beats, args.scene, npcStep(args.npc)),
      ]
      effects = outcomeResult.effects
      updatedCharacters = applyNpcEffectsToCharacters({ characters: updatedCharacters, npcId: args.npc.id, effects })
    } else if (rollRequirement && isAttackRoll(rollRequirement)) {
      // An attack: the engine rolls to hit and for damage, and changes the target's hit points. An NPC whose stat block
      // has a Multiattack makes all of it against the one it attacks, and stops when that one goes down.
      const { weapon, target: targetId } = rollRequirement.attack
      const multiattack = multiattackOf(args.npc)
      const weapons = multiattack.some((entry) => entry.attack === weapon) ? multiattack.flatMap((entry) => Array.from({ length: entry.times }, () => entry.attack)) : [weapon]
      const rolls: StoryBeat[] = []
      const facts: string[] = [...leavingFacts]
      for (const each of weapons) {
        const target = updatedCharacters.find((character) => character.id === targetId)
        if (!target || isDown(target)) break
        // The one hit may answer with Shield or Parry before the blow lands.
        const made = attackWithReactions({
          characters: updatedCharacters,
          attackerId: args.npc.id,
          targetId,
          weapon: each,
          dice: d20sOf(dice, rollRequirement.mode),
          mode: rollRequirement.mode,
          roll: dice.roll,
          rules: args.rules,
          cover: rollRequirement.attack.cover,
          ask,
        })
        const blow = made.blow
        updatedCharacters = made.characters.map((character) => (character.id === targetId ? afterHarm(character) : character))
        rolls.push(...made.reactions.map(told), attackBeat(npcStep(args.npc), args.npc, targetId, blow))
        facts.push(...made.reactions.map((taken) => taken.text), strikeFacts(args.npc.name, target.name, blow))
        rollInfo = { rollType: blow.attack.name, difficulty: blow.roll.armorClass, baseRoll: blow.roll.natural, modifier: blow.roll.bonus, result: blow.roll.total, success: blow.roll.hit }
      }
      // A caster the blows hurt saves to keep Concentration, and one they dropped loses it.
      const kept = settleConcentration({ before: args.turn.characters, after: updatedCharacters, bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }), d20: dice.d20 })
      updatedCharacters = kept.characters
      facts.push(...kept.facts)
      console.log("[LLM] NPC attacks:", facts)

      const outcomeResult = await generateNpcOutcome(
        buildNpcOutcomePrompt({
          contextString: args.npcActionContext.contextString,
          npcDetails: args.npcActionContext.npcDetails,
          playerCharacters: args.npcActionContext.playerCharacters,
          npcName: args.npc.name,
          actionSummary: args.actionResult.actionSummary,
          rollType: rollRequirement.rollType,
          result: rollInfo?.result ?? 0,
          difficulty: rollRequirement.difficulty,
          success: rolls.some((beat) => beat.kind === "roll" && beat.success),
          scene: args.scene,
          attacks: facts,
        }),
        args.npc.id
      )
      // What the attack used up: an ally's Help against the target, and the NPC's own hiding.
      updatedCharacters = afterRoll(updatedCharacters, args.npc.id, rollRequirement)
      beatsToAppend = [
        ...rolls,
        ...kept.saves.map((save) => concentrationBeat(npcStep(args.npc), save, storyNames(args.turn.characters))),
        ...cleanStory(outcomeResult.beats, args.scene, npcStep(args.npc)),
      ]
      // The harm is the engine's. The outcome may still hand over an item.
      effects = outcomeResult.effects
      updatedCharacters = applyNpcEffectsToCharacters({ characters: updatedCharacters, npcId: args.npc.id, effects })
    } else if (rollRequirement && "check" in rollRequirement) {
      // A check or a save: the NPC rolls with its stat block's bonus, which the requirement already carries, and the
      // engine settles what the roll put at stake before anyone tells it.
      const failedBy = saveFailedBy(args.npc, rollRequirement.check)
      const rolled = resolveCheck({
        dice: d20sOf(dice, rollRequirement.mode),
        bonus: rollRequirement.modifier,
        dc: rollRequirement.difficulty,
        mode: rollRequirement.mode,
        fails: !!failedBy,
        adds: checkAdds(args.npc, rollRequirement.check, dice.roll),
      })
      const { natural: baseRoll, bonus: modifier, total: result, success } = rolled
      rollInfo = {
        rollType: rollRequirement.rollType,
        difficulty: rollRequirement.difficulty,
        baseRoll,
        modifier,
        result,
        success,
      }
      const settled = applyStakes({ characters: updatedCharacters, stakes: rollRequirement.stakes, outcome: success ? "success" : "failure", roll: dice.roll, rules: args.rules })
      const stayed = settleConcentration({
        before: args.turn.characters,
        after: afterRoll(settled.characters, args.npc.id, rollRequirement),
        bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
        d20: dice.d20,
      })
      updatedCharacters = stayed.characters
      console.log("[LLM] NPC dice roll:", { rollType: rollRequirement.rollType, result, difficulty: rollRequirement.difficulty, success, harm: settled.facts })

      const outcomeResult = await generateNpcOutcome(
        buildNpcOutcomePrompt({
          contextString: args.npcActionContext.contextString,
          npcDetails: args.npcActionContext.npcDetails,
          playerCharacters: args.npcActionContext.playerCharacters,
          npcName: args.npc.name,
          actionSummary: args.actionResult.actionSummary,
          rollType: rollRequirement.rollType,
          result,
          difficulty: rollRequirement.difficulty,
          success,
          scene: args.scene,
          harm: [...(failedBy ? [`${args.npc.name} is ${failedBy} and fails this saving throw outright.`] : []), ...settled.facts, ...stayed.facts],
        }),
        args.npc.id
      )
      beatsToAppend = [
        rollBeat(npcStep(args.npc), args.npc, rollRequirement.rollType, rolled, settled.harm, settled.conditions),
        ...stayed.saves.map((save) => concentrationBeat(npcStep(args.npc), save, storyNames(args.turn.characters))),
        ...cleanStory(outcomeResult.beats, args.scene, npcStep(args.npc)),
      ]
      effects = outcomeResult.effects
      updatedCharacters = applyNpcEffectsToCharacters({ characters: updatedCharacters, npcId: args.npc.id, effects })
    } else {
      // What the rules of space would not allow is told as an entry of its own, after the NPC's own telling of the move.
      const ruled: StoryBeat[] = reading.ruling ? [{ kind: "feature", by: npcStep(args.npc), character: args.npc.id, name: reading.ruling.name, text: reading.ruling.text }] : []
      beatsToAppend = [...cleanStory(args.actionResult.beats, args.scene, npcStep(args.npc)), ...ruled]
      effects = args.actionResult.effects
      // An action with no roll (Dodge, Help) is the NPC's whole turn, and leaves its mark.
      if (reading.action) updatedCharacters = takeAction(updatedCharacters, args.npc.id, reading.action).characters

      updatedCharacters = applyNpcEffectsToCharacters({ characters: updatedCharacters, npcId: args.npc.id, effects })
    }

    // What happened as the NPC moved is told first.
    beatsToAppend = [...leaving, ...beatsToAppend]
    return {
      updatedCharacters,
      rollInfo,
      effects,
      beatsToAppend,
    }
  }
  return { resolveNpcTurnRollOrDirectBranch }
}
