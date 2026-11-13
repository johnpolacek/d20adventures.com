import type { GmPorts } from "../ports"
import { afterRoll } from "../sheet/actions"
import { type Strike, strikeFacts } from "../sheet/attack"
import { followingRoll, type InScene } from "../sheet/attack-roll"
import { checkBonus, resolveCheck } from "../sheet/check"
import { afterFelled, classCheckBonus, classConcentrationModes, classD20Floor, classTotalFloor, type Featured, rescuedCheck, resolveChosenCast, shapedCast } from "../sheet/class-rules"
import { d20Penalty, saveFailedBy } from "../sheet/conditions"
import { costWhenCountered, reactionsToCast } from "../sheet/counterspell"
import { afterHarm, deathSave } from "../sheet/death"
import { featureResolver, inspirationHelps, inspiredCheck, withoutInspiration } from "../sheet/features"
import { applyStakes } from "../sheet/harm"
import { legendaryActionsOf } from "../sheet/legendary-actions"
import { attackWithReactions, ordered } from "../sheet/reactions"
import { auraOnSave } from "../sheet/save-rules"
import { checkAdds, saveBonusFor, settleConcentration } from "../sheet/spell-effects"
import { type CastCost, castAgain, castCost, castSpell, isEngineSpell, spellById, withCastPaid } from "../sheet/spells"
import type { StoryBeat } from "../story/beats"
import { cleanStory, type StoryScene } from "../story/clean"
import { type KnownFact, ledgerNote } from "../story/knowledge"
import { castRulesNote } from "../story/limits"
import { namesHeard, namesNote } from "../story/names"
import { storyRules } from "../story/prompt"
import { lastStep, storyNames, storyText } from "../story/render"
import { attackBeat, castAnswerBeats, castBeats, concentrationBeat, rollBeat, sceneFor, storyOutputObject, withStory } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import { d20sFor, rollD20, rollDie } from "../utils/game-utils"
import { CONTINUITY_RULE, FAILED_ROLL_RULE, KNOWLEDGE_RULE } from "../utils/narrative-utils"
import { hasFled, isDead, isDown } from "../utils/turn-actors"
import { DEATH_SAVE, isAttackRoll, isCastRoll, isDeathSaveRoll, isFeatureRoll, type RequiredRoll } from "../validations/roll-requirement-schema"
import { gmNotesWithRules } from "../wiki-adventures/player-safety"
import { legendaryAfterTurn } from "./legendary-action-service"

export function getEncounterInstructionsFromPlan(plan: AdventurePlan, encounterId: string): string {
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      const encounter = scene.encounters.find((entry: { id: string }) => entry.id === encounterId)
      if (encounter) {
        return encounter.instructions || ""
      }
    }
  }
  return ""
}

function buildRollOutcomePrompt(args: {
  narrativeContext: string
  encounterInstructions: string
  presentNpcs: string
  // The absolute rules in the present NPCs' behavior.
  cast?: string
  dead: string[]
  playerActionText: string
  characterName: string
  rollType: string
  totalResult: number
  difficulty: number
  margin: number
  scene: StoryScene
  ledger?: string
  // An attack the engine has already resolved, in plain words: the hit or miss, the damage and how the target stands.
  attack?: string
  // What the roll did to hit points and conditions, already settled by the engine, in plain words.
  harm?: string[]
  // A spell cast, already resolved by the engine: its name, what it did in plain words, and for a utility spell the
  // spell's own text, which binds what it can do.
  spell?: { name: string; facts: string[]; text?: string; verb?: string }
  // What else the game settled as this happened: a caster losing Concentration.
  also?: string[]
}): string {
  return `
Context:
${args.narrativeContext}
${args.ledger ? `\n${args.ledger}\n` : ""}
Encounter Instructions:
${args.encounterInstructions}

CRITICAL: The encounter instructions may contain conditional statements (e.g., "If X is present..."). Only reference characters, objects, or events mentioned in conditionals if those conditions are actually met in the current scene. Do NOT assume conditional elements are present unless explicitly confirmed.

NPCs ACTUALLY PRESENT in this encounter:
${args.presentNpcs || "None"}
${args.cast ? `\n${args.cast}\n` : ""}${args.dead.length ? `\nDEAD: ${args.dead.join(", ")}. The dead do not act, speak or move, and are never described alive.\n` : ""}
IMPORTANT: Only reference NPCs listed above. Do NOT reference characters mentioned in conditional statements unless they are confirmed to be present.

Player action (verbatim): """${args.playerActionText}"""
  
${
  args.spell
    ? `${args.characterName} ${args.spell.verb ?? "casts"} ${args.spell.name}.${
        args.spell.facts.length
          ? `\nThe game has already rolled ${args.spell.verb ? "it" : "this spell"}:\n${args.spell.facts.map((line) => `- ${line}`).join("\n")}\nTell it exactly as stated: each hit, miss and save, and how each one stands after it. Add no other harm, healing or condition and undo none of it. Give no number.`
          : ""
      }${
        args.spell.text
          ? `\nThe spell does what its own text says and no more:\n"""${args.spell.text}"""\nIt changes no one's hit points or conditions. Tell what it shows or does here, from the encounter instructions and the story so far, and invent nothing it would reveal.`
          : ""
      }`
    : args.attack
      ? `${args.attack}\nThe game has already rolled this attack and its damage. Tell the blow exactly as stated: the hit or the miss, and how the target stands after it. Add no other harm and undo none of it. Give no number.`
      : `A dice roll was made for ${args.characterName}: ${args.rollType} (Result: ${args.totalResult}, Difficulty: ${args.difficulty}, Margin: ${args.margin}).${
          args.harm?.length
            ? `\nThe game has already settled what this did to hit points and conditions:\n${args.harm.map((line) => `- ${line}`).join("\n")}\nTell it exactly as stated. Add no other harm, healing or condition and undo none of it. Give no number.`
            : "\nThis roll changes no one's hit points or conditions. No one is wounded, healed, knocked down, knocked out or killed by it."
        }`
}
${args.also?.length ? `\nThe game has also settled this, which holds as stated:\n${args.also.map((line) => `- ${line}`).join("\n")}\n` : ""}
  Guidelines:
  - ALWAYS generate narrative if NPCs are present and the action relates to them (attacking, hiding from, avoiding, reacting to, interacting with, etc.). Actions that respond to NPC threats or presence should be narrated.
  - Generate narrative for successful rolls that affect or respond to NPCs (e.g., successfully hiding from a monster, avoiding an attack, etc.).
  - Do not narrate speech or actions for player characters.
  - Return no beats only if the action is EXCLUSIVELY between player characters with no NPC involvement AND no environmental consequences.
  - Do not invent new objects, people, events, or details. Use only the encounter instructions/intro and established narrative. Someone or something the player's action names that is not established is not there. A position, state or fact the player's action assumes, such as where someone is, holds only if the story shows it. Tell the outcome against the scene as the story shows it.
  - Decide only what this roll decides. Nothing else is resolved here: no one else is killed, captured or beaten.
  - ${CONTINUITY_RULE}${args.margin < 0 ? `\n  - This roll failed. ${FAILED_ROLL_RULE}` : ""}
  - Only reference NPCs that are actually present (listed above).
  - ${KNOWLEDGE_RULE}

Write the immediate outcome of the roll as beats: at most 2 short sentences of narration and action, 40 words in all. Say what the action did and where it leaves the characters. Do not describe the hero's action or its wind-up again, since the story has just told it, and do not describe again what the Context already describes. An NPC's spoken line is extra and short. Focus on how the NPC(s) react, perceive, or are affected by the action, or describe the environmental/atmospheric result of the successful roll. The hero's own attack already shows as an effect, so give effects only to what an NPC does.

Write in third person PRESENT tense. Do not use semicolons. Never mention game mechanics, dice, or rules.

${storyRules(args.scene)}

Respond as JSON: { "beats": [...] }`.trim()
}

function sanitizeRollOutcome(text: string): string {
  const rollOutcome = (text || "").trim()
  const metaCommentaryPatterns = [/\[No output provided.*?\]/i, /\[No narrative.*?\]/i, /\[Nothing to output.*?\]/i, /No output provided/i, /No narrative applies/i]
  const isMetaCommentary = metaCommentaryPatterns.some((pattern) => pattern.test(rollOutcome))
  return isMetaCommentary ? "" : rollOutcome
}

export function createAdventureRollResultService(ports: GmPorts) {
  const wait = ports.sleep?.bind(ports) ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  async function resolvePlayerRollNarrativeAndCharacters(args: {
    turn: {
      _id: string
      encounterId: string
      title: string
      story: StoryBeat[]
      characters: TurnCharacter[]
      adventureId: string
      isFinalEncounter?: boolean
    }
    character: TurnCharacter & { rollRequired: RequiredRoll }
    characterId: string
    // The d20s the roller threw. Any the roll still needs are rolled here: two with Advantage or Disadvantage.
    dice?: number[]
    encounterInstructions: string
    // The adventure's `playerDeath` rule. False leaves a hero who would die Stable at 0 hit points instead.
    playerDeath?: boolean
    // The adventure's premise, added to the GM's notes.
    premise?: string
    // What each character knows, so the outcome gives no one what they do not.
    knowledge?: KnownFact[]
    // The adventure's heroes start as strangers: the outcome is told whose names who has not heard.
    strangers?: boolean
  }): Promise<{
    story: StoryBeat[]
    characters: TurnCharacter[]
  }> {
    const required = args.character.rollRequired
    const { rollType, mode } = required
    const by = { step: "roll" as const, character: args.character.id }
    const rules = { playerDeath: args.playerDeath }
    // The hero's turn is over: a Legendary creature may act on it, told after the turn's own story (../sheet/legendary-actions).
    const afterTurn = async (done: { story: StoryBeat[]; characters: TurnCharacter[] }) => {
      if (!done.characters.some((character) => legendaryActionsOf(character))) return done
      const acted = legendaryAfterTurn({ characters: done.characters, endedId: args.characterId, floor: await ports.content.floor?.(args.turn.encounterId), rules })
      return { story: [...done.story, ...acted.beats], characters: acted.characters }
    }
    if (isDeathSaveRoll(required)) {
      // A dying hero's Death Saving Throw: the rules decide it, and the roll beat tells it. No model is asked.
      // With Advantage (Beacon of Hope) the higher of two dice counts, its 1 or 20 too.
      const dice = d20sFor(mode, args.dice)
      const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
      const saved = deathSave(args.character, natural, rules)
      const bonus = 0 - d20Penalty(args.character)
      // The beat keeps the saves as this throw left them, and how it ended the hero's dying.
      const fate = saved.fate === "revived" ? ("revived" as const) : saved.fate === "dies" ? ("dead" as const) : saved.fate === "stable" ? ("stable" as const) : undefined
      const beat: StoryBeat = {
        ...rollBeat(by, args.character, DEATH_SAVE.rollType, { dice, natural, bonus, total: natural + bonus, dc: DEATH_SAVE.difficulty, success: saved.success, mode }),
        deathSave: { ...saved.saves, ...(fate ? { fate } : {}) },
      }
      return afterTurn({
        ...withStory(args.turn, [beat]),
        characters: args.turn.characters.map((character) =>
          character.id === args.characterId ? { ...saved.character, rollRequired: undefined, rollResult: natural, isComplete: true, hasReplied: true } : character
        ),
      })
    }
    let turnCharacters = args.turn.characters
    // The encounter's floor: what a hit moves is walked over it, and what the roll used up reads it.
    const floor = await ports.content.floor?.(args.turn.encounterId)
    let blow: Strike | undefined
    let stakeFacts: string[] = []
    let target: TurnCharacter | undefined
    let rolls: StoryBeat[]
    // A spell cast, for the outcome's prompt.
    let spellCast: { name: string; facts: string[]; text?: string; verb?: string } | undefined
    // Everyone the roll fell on, who stay named among those present so the outcome can tell them falling.
    let struckIds: string[] = []
    let numbers: { natural: number; bonus: number; total: number; against: number; success: boolean }
    // Whether the roller's Bardic Inspiration die was rolled, and so is spent.
    let inspired = false
    if (isFeatureRoll(required)) {
      // A class feature used as the action (Channel Divinity), or a Beast's breath in Wild Shape: the engine rolls it and
      // every target's save, and spends the use, as it does a spell that asks for no throw. It is told by the same path
      // as a cast.
      const used = featureResolver(required.feature.id)({ characters: turnCharacters as Featured[], actorId: args.characterId, feature: required.feature, d20: rollD20, roll: rollDie, rules })
      turnCharacters = used.characters as typeof turnCharacters
      const { name } = used
      rolls = castBeats(by, args.character, { name }, used, storyNames(args.turn.characters), "uses")
      spellCast = { name, facts: used.problem ? [used.problem] : used.facts, verb: "uses" }
      struckIds = used.targets
      numbers = { natural: 0, bonus: 0, total: 0, against: 0, success: !used.problem }
    } else if (isCastRoll(required)) {
      // A spell: the engine resolves it by its typed data, and spends what it costs. A spell attack takes the caster's
      // d20. Any other takes none, and each target's saving throw is rolled here.
      // A spell the caster holds and uses again (Spiritual Weapon's attack) costs nothing and draws no reaction.
      const spell = spellById.get(required.cast.spell)
      if (!spell) throw new Error(`"${required.cast.spell}" is not a spell.`)
      const again = required.cast.again === true
      const cost = again ? undefined : castCost(args.character, spell.id, required.cast.ritual === true, required.cast.level, required.cast.item === true)
      if (cost && "problem" in cost) throw new Error(cost.problem)
      const names = storyNames(args.turn.characters)
      // The spell as the caster's choices make it (Metamagic): Subtle Spell's casting draws no Counterspell.
      const chosen = required.cast.choices
      const slot = cost && "cost" in cost && cost.cost.kind === "slot" ? cost.cost.level : undefined
      const shaped = shapedCast(chosen, { spell, level: required.cast.level ?? spell.level, slot, damageType: required.cast.damageType }).spell
      // Those of the other side may counter it, and those Magic Missile is aimed at may cast Shield, each by their
      // standing order at once: no one is asked on another's turn.
      const standing = turnCharacters
      const answered = cost
        ? reactionsToCast({
            characters: turnCharacters,
            casterId: args.characterId,
            spell: shaped,
            targets: required.cast.targets,
            ask: (offer) => ordered(standing.find((character) => character.id === offer.to)?.standingOrders, offer.id, offer.matters),
            d20: rollD20,
            roll: rollDie,
          })
        : undefined
      if (answered) turnCharacters = answered.characters
      const reacted = answered ? castAnswerBeats(by, answered, names) : []
      // What paying for the cast comes to: an item's last charge may destroy it.
      let paidFacts: string[] = []
      const pay = <C extends (typeof turnCharacters)[number]>(character: C, paying: CastCost): C => {
        const paid = withCastPaid(character, paying, rollDie)
        paidFacts = paid.facts
        return paid.character
      }
      if (answered?.countered && cost) {
        // Countered: the action is spent and the cast is not made, and a slot is not expended.
        turnCharacters = turnCharacters.map((character) => (character.id === args.characterId ? pay(character, costWhenCountered(cost.cost)) : character))
        rolls = reacted
        spellCast = { name: spell.name, facts: [...answered.facts, ...paidFacts] }
        numbers = { natural: 0, bonus: 0, total: 0, against: 0, success: false }
      } else {
        const how = {
          characters: turnCharacters,
          casterId: args.characterId,
          targets: required.cast.targets,
          ...(spell.attack ? { attackDice: d20sFor(mode, args.dice) } : {}),
          mode,
          d20: rollD20,
          roll: rollDie,
          rules,
          damageType: required.cast.damageType,
          skill: required.cast.skill,
          choice: required.cast.choice,
          cover: required.cast.cover,
          measured: required.cast.measured,
          floor,
          ...(required.cast.item ? { item: true } : {}),
        }
        // A cast with the choices that ride it (Metamagic), each wrapped around the engine's own resolution.
        const cast = again
          ? castAgain({ ...how, spellId: spell.id })
          : resolveChosenCast({ choices: chosen, input: { ...how, spell, level: required.cast.level }, slot, resolve: (input) => castSpell(input) })
        turnCharacters = cast.characters.map((character) => (character.id === args.characterId && cost ? pay(character, cost.cost) : character))
        rolls = [...reacted, ...castBeats(by, args.character, spell, cast, names)]
        spellCast = { name: spell.name, facts: [...(answered?.facts ?? []), ...cast.facts, ...paidFacts], ...(isEngineSpell(spell) ? {} : { text: spell.description }) }
        struckIds = required.cast.targets
        const thrown = cast.attack?.roll
        numbers = thrown
          ? { natural: thrown.natural, bonus: thrown.bonus, total: thrown.total, against: thrown.armorClass, success: thrown.hit }
          : { natural: 0, bonus: 0, total: 0, against: 0, success: true }
      }
    } else if (isAttackRoll(required)) {
      // An attack: the engine rolls to hit against the target's Armor Class and, on a hit, the damage. The target's
      // hit points change here and nowhere else.
      target = turnCharacters.find((character) => character.id === required.attack.target)
      if (!target) throw new Error("The one attacked is no longer here.")
      // The one hit may answer with Parry or Shield before the blow lands. An NPC, and a hero on another hero's
      // turn, follow their standing order at once.
      const standing = turnCharacters
      const made = attackWithReactions({
        characters: turnCharacters,
        attackerId: args.characterId,
        targetId: target.id,
        weapon: required.attack.weapon,
        dice: d20sFor(mode, args.dice),
        mode,
        roll: rollDie,
        rules,
        inspiration: args.character.inspiration,
        cover: required.attack.cover,
        choices: required.attack.choices,
        charge: required.attack.charge,
        ask: (offer) => ordered(standing.find((character) => character.id === offer.to)?.standingOrders, offer.id, offer.matters),
      })
      blow = made.blow
      inspired = made.blow.inspired !== undefined
      turnCharacters = made.characters.map((character) => (character.id === required.attack.target ? afterHarm(character) : character))
      rolls = [...made.reactions.map((taken): StoryBeat => ({ kind: "feature", by, character: taken.by, name: taken.name, text: taken.text })), attackBeat(by, args.character, target.id, blow)]
      struckIds = [target.id]
      numbers = { natural: blow.roll.natural, bonus: blow.roll.bonus, total: blow.roll.total, against: blow.roll.armorClass, success: blow.roll.hit }
    } else {
      // The bonus is read from the sheet as the die lands, so the sheet is always the one source of it.
      // A condition may make the roller fail a saving throw outright, whatever the dice show.
      const failedBy = saveFailedBy(args.character, required.check)
      const thrown = resolveCheck({
        dice: d20sFor(mode, args.dice),
        // Slow's −2 on a Dexterity save, and an aura of one near on any save (Aura of Protection).
        bonus: classCheckBonus(args.character, required.check) + saveBonusFor(args.character, required.check) + auraOnSave(args.character, required.check, args.turn.characters),
        dc: required.difficulty,
        mode,
        fails: !!failedBy,
        adds: checkAdds(args.character, required.check, rollDie),
        // Reliable Talent: a low die on a trained skill counts as a 10.
        least: classD20Floor(args.character, required.check),
        // Indomitable Might: a Strength check or save totals at least the Strength score.
        leastTotal: classTotalFloor(args.character, required.check),
      })
      // A held Bardic Inspiration die is rolled on a failure it could turn into a success.
      const held = args.character.inspiration
      const lifted = !failedBy && !thrown.success && inspirationHelps(held, thrown.dc - thrown.total) ? inspiredCheck(thrown, held, rollDie) : thrown
      inspired = lifted.inspired !== undefined
      // What the roller's class may still do for a failed check: a Fighter's Tactical Mind takes a d10, paid for with
      // Second Wind only when it then succeeds.
      const check = required.check
      const minded = failedBy
        ? undefined
        : rescuedCheck({
            character: args.character,
            check,
            result: lifted,
            roll: rollDie,
            staked: !!required.stakes?.some((stake) => stake.on === "failure" && stake.target === args.characterId && stake.kind !== "healing"),
          })
      const result = minded?.result ?? lifted
      const after = minded?.after
      if (after) turnCharacters = turnCharacters.map((character) => (character.id === args.characterId ? after(character) : character))
      // What the roll put at stake is settled here, by the engine: who it hurts or heals, and how they stand after.
      const settled = applyStakes({ characters: turnCharacters, stakes: required.stakes, outcome: result.success ? "success" : "failure", roll: rollDie, rules })
      turnCharacters = settled.characters
      stakeFacts = [...(failedBy ? [`${args.character.name} is ${failedBy} and fails this saving throw outright.`] : []), ...settled.facts]
      rolls = [rollBeat(by, args.character, rollType, result, settled.harm, settled.conditions)]
      numbers = { natural: result.natural, bonus: result.bonus, total: result.total, against: result.dc, success: result.success }
    }
    // What the roll used up: an ally's Help, and the roller's own hiding when they attacked.
    turnCharacters = afterRoll(turnCharacters, args.characterId, required, blow?.taken, floor)
    // Concentration: a caster who lost hit points saves to keep their spell, and one now down or unable to act loses it.
    const held = settleConcentration({
      before: args.turn.characters,
      after: turnCharacters,
      bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
      modes: classConcentrationModes,
      d20: rollD20,
    })
    turnCharacters = held.characters
    rolls = [...rolls, ...held.saves.map((save) => concentrationBeat(by, save, storyNames(args.turn.characters)))]
    // What the classes give once the roll dropped an enemy to 0 hit points (Dark One's Blessing).
    const fell = afterFelled({ before: args.turn.characters, after: turnCharacters, by: args.characterId })
    turnCharacters = fell.characters
    rolls = [...rolls, ...fell.told.map((gain): StoryBeat => ({ kind: "feature", by, character: gain.by, name: gain.name, text: gain.text }))]
    if (inspired) turnCharacters = turnCharacters.map((character) => (character.id === args.characterId ? withoutInspiration(character) : character))
    const { total: totalResult, against: difficulty } = numbers
    const margin = totalResult - difficulty
    const story = args.turn.story
    const names = storyNames(args.turn.characters)
    const playerActionText = storyText(lastStep(story), names)
    const narrativeContext = storyText(story, names).split(/\n\n+/).slice(-2).join("\n\n")
    const scene = await sceneFor(ports, args.turn)
    let added: StoryBeat[] = rolls
    // The dead are named apart, so an outcome does not have one gasp or stand again.
    // The one just struck down is still named among those present, so the outcome can tell them falling.
    const presentNpcs = turnCharacters
      .filter((character) => character.type === "npc" && (!isDown(character) || struckIds.includes(character.id)) && !hasFled(character))
      .map((character) => character.name)
      .join(", ")
    const deadNames = turnCharacters.filter((character) => isDead(character) && !struckIds.includes(character.id)).map((character) => character.name)

    const rollOutcomePrompt = buildRollOutcomePrompt({
      narrativeContext,
      encounterInstructions: gmNotesWithRules(args, args.encounterInstructions) ?? "",
      presentNpcs,
      cast: castRulesNote(args.turn.characters),
      dead: deadNames,
      playerActionText,
      characterName: args.character.name,
      rollType,
      totalResult,
      difficulty,
      margin,
      scene,
      attack: blow && target ? strikeFacts(args.character.name, target.name, blow) : undefined,
      harm: stakeFacts,
      spell: spellCast,
      also: [...held.facts, ...fell.told.map((gain) => gain.text)],
      ledger: [ledgerNote(args.knowledge, names), args.strangers ? namesNote(namesHeard(args.knowledge, args.turn), args.turn.characters) : ""].filter(Boolean).join("\n\n"),
    })

    try {
      const { object } = await generateObject({ prompt: rollOutcomePrompt, schema: storyOutputObject })
      const outcome = cleanStory(object.beats, scene, by).filter((b) => !("text" in b) || sanitizeRollOutcome(b.text))
      added = [...rolls, ...outcome]
    } catch (error) {
      console.error("[resolvePlayerRollResult] Error generating roll outcome:", error)
    }

    const { story: newStory } = withStory(args.turn, added)
    await wait(500)

    // What the turn still holds after this roll: the rest of an Attack action, Horde Breaker, a Hide. The hero throws
    // the next d20 as they threw this one, and their turn is not over until it is.
    const roller = turnCharacters.find((character) => character.id === args.characterId)
    const next = roller && !isFeatureRoll(required) ? followingRoll({ character: roller as InScene, made: required, present: turnCharacters as InScene[], floor }) : undefined
    // Anyone the outcome left down with no Death Saving Throw to make this round is done with it.
    const updatedCharacters = turnCharacters.map((character) =>
      character.id === args.characterId
        ? next
          ? { ...character, rollRequired: next, rollResult: undefined, isComplete: false, hasReplied: true }
          : {
              ...character,
              rollRequired: undefined,
              rollResult: totalResult,
              isComplete: true,
              hasReplied: true,
            }
        : afterHarm(character)
    )

    return next ? { story: newStory, characters: updatedCharacters } : afterTurn({ story: newStory, characters: updatedCharacters })
  }
  return { resolvePlayerRollNarrativeAndCharacters }
}
