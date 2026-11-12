import type { GmPorts } from "../ports"
import { afterRoll, takeAction } from "../sheet/actions"
import { multiattackOf, strike, strikeFacts } from "../sheet/attack"
import { resolveCheck } from "../sheet/check"
import { saveFailedBy } from "../sheet/conditions"
import { afterHarm, killed } from "../sheet/death"
import { applyStakes } from "../sheet/harm"
import type { StoryBeat, StoryBy, StoryOutput } from "../story/beats"
import { cleanStory, type StoryScene } from "../story/clean"
import { attackBeat, rollBeat, turnScript } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import { d20sFor, rollDie } from "../utils/game-utils"
import { isDown } from "../utils/turn-actors"
import { isAttackRoll } from "../validations/roll-requirement-schema"
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

    if (rollRequirement && isAttackRoll(rollRequirement)) {
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
      beatsToAppend = [...rolls, ...cleanStory(outcomeResult.beats, args.scene, npcStep(args.npc))]
      // The harm is the engine's. The outcome may still hand over an item.
      effects = outcomeResult.effects
      updatedCharacters = applyNpcEffectsToCharacters({ characters: updatedCharacters, npcId: args.npc.id, effects })
    } else if (rollRequirement && "check" in rollRequirement) {
      // A check or a save: the NPC rolls with its stat block's bonus, which the requirement already carries, and the
      // engine settles what the roll put at stake before anyone tells it.
      const failedBy = saveFailedBy(args.npc, rollRequirement.check)
      const rolled = resolveCheck({ dice: d20sFor(rollRequirement.mode), bonus: rollRequirement.modifier, dc: rollRequirement.difficulty, mode: rollRequirement.mode, fails: !!failedBy })
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
      updatedCharacters = afterRoll(settled.characters, args.npc.id, rollRequirement)
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
          harm: [...(failedBy ? [`${args.npc.name} is ${failedBy} and fails this saving throw outright.`] : []), ...settled.facts],
        }),
        args.npc.id
      )
      beatsToAppend = [rollBeat(npcStep(args.npc), args.npc, rollRequirement.rollType, rolled, settled.harm, settled.conditions), ...cleanStory(outcomeResult.beats, args.scene, npcStep(args.npc))]
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
