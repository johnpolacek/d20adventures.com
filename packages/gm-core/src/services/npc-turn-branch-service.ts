import type { GmPorts } from "../ports"
import { afterRoll, takeAction } from "../sheet/actions"
import { multiattackOf, strike, strikeFacts } from "../sheet/attack"
import { checkBonus, resolveCheck } from "../sheet/check"
import { saveFailedBy } from "../sheet/conditions"
import { afterHarm, killed } from "../sheet/death"
import { applyStakes } from "../sheet/harm"
import { checkAdds, settleConcentration } from "../sheet/spell-effects"
import { castCost, castSpell, isEngineSpell, spellById, withCastSpent } from "../sheet/spells"
import type { StoryBeat, StoryBy, StoryOutput } from "../story/beats"
import { cleanStory, type StoryScene } from "../story/clean"
import { storyNames } from "../story/render"
import { attackBeat, castBeats, concentrationBeat, rollBeat, turnScript } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import { d20sFor, rollD20, rollDie } from "../utils/game-utils"
import { isDown } from "../utils/turn-actors"
import { isAttackRoll, isCastRoll } from "../validations/roll-requirement-schema"
import type { SafetyRules } from "../wiki-adventures/player-safety"
import { buildNpcOutcomePrompt, createNpcTurnGenerationService } from "./npc-turn-generation-service"
import { applyNpcEffectsToCharacters, type NpcTurnEffect } from "./npc-turn-resolution-service"
import { createRollRequirementService } from "./roll-requirement-service"

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
  }): Promise<Omit<NpcTurnBranchResult, "actionSummary">> {
    let beatsToAppend: StoryBeat[] = []
    const script = turnScript(args.turn)
    let updatedCharacters = [...args.turn.characters]
    let rollInfo: NpcRollInfo | undefined
    let effects: NpcTurnEffect[] | undefined

    const reading = await readAction(args.actionResult.actionSummary, args.npc, {
      encounterInstructions: args.encounterContext?.instructions || "",
      encounterIntro: args.encounterContext?.intro || "",
      narrativeContext: script,
      present: args.turn.characters,
    })
    const rollRequirement = reading.roll

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
        ...(spell.attack ? { attackDice: d20sFor(casting.mode) } : {}),
        mode: casting.mode,
        d20: rollD20,
        roll: rollDie,
        rules: args.rules,
        damageType: casting.cast.damageType,
        skill: casting.cast.skill,
        level: casting.cast.level,
      })
      const spent = cast.characters.map((character) => (character.id === args.npc.id ? withCastSpent(character, cost.cost) : character))
      const kept = settleConcentration({
        before: args.turn.characters,
        after: afterRoll(spent, args.npc.id, casting),
        bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
        d20: rollD20,
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
      const facts: string[] = []
      for (const each of weapons) {
        const target = updatedCharacters.find((character) => character.id === targetId)
        if (!target || isDown(target)) break
        const blow = strike({ attacker: args.npc, target, weapon: each, dice: d20sFor(rollRequirement.mode), mode: rollRequirement.mode, roll: rollDie, rules: args.rules })
        updatedCharacters = updatedCharacters.map((character) => (character.id === targetId ? afterHarm(blow.target) : character))
        rolls.push(attackBeat(npcStep(args.npc), args.npc, targetId, blow))
        facts.push(strikeFacts(args.npc.name, target.name, blow))
        rollInfo = { rollType: blow.attack.name, difficulty: blow.roll.armorClass, baseRoll: blow.roll.natural, modifier: blow.roll.bonus, result: blow.roll.total, success: blow.roll.hit }
      }
      // A caster the blows hurt saves to keep Concentration, and one they dropped loses it.
      const kept = settleConcentration({ before: args.turn.characters, after: updatedCharacters, bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }), d20: rollD20 })
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
        dice: d20sFor(rollRequirement.mode),
        bonus: rollRequirement.modifier,
        dc: rollRequirement.difficulty,
        mode: rollRequirement.mode,
        fails: !!failedBy,
        adds: checkAdds(args.npc, rollRequirement.check, rollDie),
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
      const settled = applyStakes({ characters: updatedCharacters, stakes: rollRequirement.stakes, outcome: success ? "success" : "failure", roll: rollDie, rules: args.rules })
      const stayed = settleConcentration({
        before: args.turn.characters,
        after: afterRoll(settled.characters, args.npc.id, rollRequirement),
        bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
        d20: rollD20,
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
      beatsToAppend = cleanStory(args.actionResult.beats, args.scene, npcStep(args.npc))
      effects = args.actionResult.effects
      // An action with no roll (Dodge, Help) is the NPC's whole turn, and leaves its mark.
      if (reading.action) updatedCharacters = takeAction(updatedCharacters, args.npc.id, reading.action).characters

      updatedCharacters = applyNpcEffectsToCharacters({ characters: updatedCharacters, npcId: args.npc.id, effects })
    }

    return {
      updatedCharacters,
      rollInfo,
      effects,
      beatsToAppend,
    }
  }
  return { resolveNpcTurnRollOrDirectBranch }
}
