import { conditionIdSchema, conditionIds, damageTypeIdSchema, skillIdSchema } from "@d20/srd"
import { abilityById } from "@d20/srd/abilities"
import { z } from "zod"
import type { GmPorts } from "../ports"
import { checkModesFromActions, HIDE_DC, hideRoll, type TakenAction } from "../sheet/actions"
import { attacksOf, cunningStrikesOf, defensesOf } from "../sheet/attack"
import { attackAfter, attackRequirement, type InScene } from "../sheet/attack-roll"
import { type DivinityEffect, divinityPicksOf, isUndead } from "../sheet/channel-divinity"
import { checkBonus, checkFromMenu, checkMenu, checkMenuIds, checkName, combineModes, DIFFICULTY_CLASSES, difficulties, rollModes, sheetModes, spellcastingAbilityOf } from "../sheet/check"
import { conditionSpans } from "../sheet/condition-entry"
import { CONDITION_RULES, cannotAttack, checkModesFrom, conditionWords } from "../sheet/conditions"
import { hasFeature, usesLeft } from "../sheet/feature-rules"
import { bonusActionsOf, usable } from "../sheet/features"
import { type MoveAsk, type Moved, moveBudget, takeMove, withMove } from "../sheet/moves"
import type { EncounterFloor } from "../sheet/placement"
import type { RestKind } from "../sheet/rest"
import { attackReach, coverBonus, feetBetween, placedOf, within } from "../sheet/space"
import { attackModesFromSpells } from "../sheet/spell-effects"
import { castInSpace } from "../sheet/spell-space"
import { castCost, isEngineSpell, slotsLeft, slotWords, spellAttackModes, spellcastingOf, spellsOf, targetLimit } from "../sheet/spells"
import { HARM_DICE, harmSizes, printedDiceSchema, type Stake } from "../sheet/stakes"
import { combatStatsOf } from "../sheet/stat-block"
import { actionIds } from "../sheet/turn-effect"
import type { TurnCharacter } from "../types/adventure"
import type { Character } from "../types/character"
import { hasFled, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import type { ChosenRoll, RequiredCast, RequiredFeature } from "../validations/roll-requirement-schema"

// An NPC whose action the notes fix rolls nothing. Mara's lift "always happens" unless a hero spots it, yet she rolled
// Sleight of Hand, failed, and the theft the scene turns on never happened.
const NPC_FIXED_OUTCOME =
  "   This character is an NPC. When the encounter instructions say what this NPC does here always happens or works, or that only a hero's check or choice can stop it, choose no roll: the NPC does not roll against an outcome the notes fix."

// What the game master picks, each from a fixed menu. The engine works out the rest: the bonus from the roller's sheet
// or stat block, the target number from the difficulty's name, and the dice.
const rollPickSchema = z.object({
  check: z
    .enum(["none", "attack", "cast", "hide", "short-rest", "long-rest", ...actionIds, ...checkMenuIds])
    .describe(
      'The check\'s id from the menu, "attack" for an attack, "cast" for one of the character\'s own spells, an action of a fight ("hide", "dodge", "help", "dash", "disengage"), or "none" when nothing is rolled'
    ),
  difficulty: z.enum(difficulties).optional().describe("How hard the task is, by name. Needed for every check"),
  mode: z.enum(rollModes).optional().describe('"advantage" or "disadvantage" when this moment\'s circumstances clearly help or hinder, else "normal"'),
  reason: z.string().max(120).optional().describe("What gives the Advantage or Disadvantage, in a few words"),
  spell: z.string().max(80).optional().describe('For "cast": the id of one of the character\'s own spells, from Their Spells'),
  targets: z.array(z.string().max(80)).max(8).optional().describe('For "cast": the ids of everyone the spell is cast on, from Who Is Here or the character\'s own id'),
  ritual: z.boolean().optional().describe('For "cast": true when a spell marked ritual is cast slowly, outside a fight, to spare its slot'),
  slot: z.number().int().min(1).max(9).optional().describe('For "cast": the spell slot level, only when the player says they cast it with a higher slot'),
  damageType: z.string().max(20).optional().describe('For "cast": the damage type chosen, for a spell that offers several'),
  weapon: z.string().max(80).optional().describe("For an attack: the id of one of the character's own attacks"),
  target: z.string().max(80).optional().describe('For an attack: the id of who is attacked, from Who Is Here. For "help": the id of the ally helped, or of the enemy an ally will attack'),
  helps: z.string().max(40).optional().describe('For "help" given to an ally\'s check, or a spell cast for one skill such as Guidance: the id of the skill it is for'),
  bonus: z.string().max(40).optional().describe("The id of one of the character's own Bonus Actions they also use this turn, from Their Bonus Actions"),
  bonusTarget: z.string().max(80).optional().describe("For a Bonus Action given to someone else: their id"),
  moveTo: z.string().max(80).optional().describe("Where the character goes before they act: the id of a place or of someone here, from Where Things Are"),
  moveAway: z.string().max(80).optional().describe("Instead of moveTo: the id of someone here they back straight away from"),
  moveFeet: z.number().min(0).max(240).optional().describe("How far they go, when they do not go the whole way: a step is 5, and backing off or edging toward something is 10"),
  cover: z
    .enum(["half", "three-quarters", "total"])
    .optional()
    .describe("For an attack: cover the target has that the story put there and the place does not hold, such as a table just overturned. The game reads walls and furniture itself"),
  harm: z
    .array(
      z.object({
        on: z.enum(["success", "failure", "always"]).describe("The outcome of this roll that does it"),
        target: z.string().max(80).describe("The id of who it happens to: someone from Who Is Here, or the character's own id"),
        kind: z.enum(["damage", "healing", "condition", "end-condition"]),
        size: z.enum(harmSizes).optional().describe("For damage and healing: how much, by name. The game rolls its dice"),
        dice: z.string().max(12).optional().describe('Dice the encounter instructions print for it, as printed: "4d6". They replace the size'),
        type: z.string().max(20).optional().describe("For damage: its type, such as fire, poison, bludgeoning or psychic"),
        condition: z.string().max(20).optional().describe("For a condition given or ended: its id, such as prone, poisoned or restrained"),
        span: z.enum(conditionSpans).optional().describe("For a condition given: how long it lasts"),
        source: z.string().max(80).optional().describe("For charmed, frightened or grappled: the id of who it comes from"),
      })
    )
    .max(4)
    .optional()
    .describe("For a check or a save whose outcome would itself wound or heal someone, or give or end a condition. Empty for most rolls, and for every attack"),
})

// Someone the roller could attack: anyone else in the scene who is still up.
type Present = Pick<TurnCharacter, "id" | "name"> &
  Partial<Pick<TurnCharacter, "type" | "sheet" | "hitPoints" | "healthPercent" | "dead" | "fled" | "conditions" | "turnEffects" | "spellEffects" | "isComplete" | "position">> & { statBlock?: string }

/** What the game master reads a character's move as: a roll the engine asks for, an action that takes none, or neither. */
export type TurnReading = {
  roll: ChosenRoll | null
  action?: TakenAction
  /** A spell cast that asks for no throw: it is resolved as the move is read, never left waiting on the caster. */
  cast?: RequiredCast
  /** A class feature used as the action that asks for no throw (Channel Divinity), resolved as a cast is. */
  feature?: RequiredFeature
  /** Action Surge is used: one more action this turn, which the attack's `after` already counts. Its use is spent as the reading is applied. */
  surge?: true
  /** One of the roller's own Bonus Actions, used beside the action. */
  bonus?: { feature: string; target?: string }
  /** Where the move took the roller before they acted, and the feet it used. */
  move?: Moved
  /** A rest the party takes, which the hero's turn is given to. */
  rest?: RestKind
  /** Something the move asked for that the rules of space do not allow, to be told in the story: an attack out of reach. */
  ruling?: { name: string; text: string }
}

const MENU = (kind: "skill" | "ability" | "save") =>
  checkMenu
    .filter((entry) => entry.check.kind === kind)
    .map((entry) => `   - ${entry.id}: ${entry.name}. ${entry.uses}.`.replace(/\.\.$/, "."))
    .join("\n")

export function createRollRequirementService(ports: GmPorts) {
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  type Options = {
    encounterInstructions?: string
    encounterIntro?: string
    narrativeContext?: string
    // Everyone in the scene. The roller can attack any of the others who is still up.
    present?: readonly Present[]
    // The encounter's floor. With it and a position, the roller moves before they act, and reach and range are measured.
    floor?: EncounterFloor
  }
  /** The roll a move asks for, where only the roll is wanted: an action that takes none is read as no roll. */
  const getRollRequirementForAction = async (action: string, character: Character, options?: Options): Promise<ChosenRoll | null> => (await readAction(action, character, options)).roll

  /**
   * The read of a move, with what a Bonus Action taken beside it adds once the rest is settled. Cunning Action's Hide
   * is the Stealth check of the Hide action, made after the turn's own roll, or as the roll when the turn has none.
   * Steady Aim cannot be taken with a move.
   */
  async function readAction(action: string, character: Character, options?: Options): Promise<TurnReading> {
    const reading = await readPicked(action, character, options)
    const self = "id" in character ? character.id : undefined
    if (reading.bonus?.feature === "rogue-steady-aim" && reading.move) {
      const { bonus: _, ...rest } = reading
      return rest
    }
    if (reading.bonus?.feature !== "cunning-action-hide" || !self) return reading
    if (reading.roll && "check" in reading.roll && reading.roll.rollType === hideRoll({ ...character, id: self }).rollType) return reading
    if (reading.roll) return { ...reading, roll: { ...reading.roll, after: { ...reading.roll.after, hide: true } } }
    if (reading.cast) return { ...reading, cast: { ...reading.cast, after: { ...reading.cast.after, hide: true } } }
    if (reading.feature) return { ...reading, feature: { ...reading.feature, after: { ...reading.feature.after, hide: true } } }
    if (reading.rest) return reading
    return { ...reading, roll: hideRoll({ ...character, id: self }) }
  }

  async function readPicked(action: string, character: Character, options?: Options): Promise<TurnReading> {
    const { encounterInstructions = "", encounterIntro = "", narrativeContext = "" } = options || {}
    const self = "id" in character ? character.id : undefined
    // One who is Charmed cannot attack the charmer.
    const targets = (options?.present ?? []).filter((other) => other.id !== self && !isDown(other) && !hasFled(other) && !cannotAttack(character, other))
    // Where the roller stands, when the encounter has a floor: who else is on it, and how far each is.
    const floor = options?.floor
    const mover = self && floor && character.position ? { ...character, id: self } : undefined
    const others = (options?.present ?? []).filter((other) => other.id !== self && !isDead(other) && !hasFled(other))
    const feetAway = (other: Present) => {
      const feet = mover ? feetBetween(mover, other) : undefined
      return feet === undefined ? undefined : `${Math.round(feet)} feet away`
    }
    const conditions = conditionWords(character)
    const attacks = attacksOf(character)
    const bonusActions = bonusActionsOf(character).filter(usable)
    // The features of a hero's own the player chooses in the moment, each only while it can be used.
    const hero = "type" in character && character.type === "pc"
    const surges = hero && usesLeft(character, "fighter-action-surge") > 0
    const cunnings = hero ? cunningStrikesOf(character) : []
    const divinity = hero ? divinityPicksOf(character) : []
    // Hunter's Lore: a Hunter knows the defenses of the one their Hunter's Mark is on.
    const lore = (other: Present) => {
      if (!self || !hasFeature(character, "hunter-hunters-lore") || !other.spellEffects?.some((effect) => effect.spell === "hunters-mark" && effect.by === self)) return undefined
      const { immunities = [], resistances = [], vulnerabilities = [] } = defensesOf({ ...other, type: other.type ?? "npc" })
      const words = [
        immunities.length ? `immune to ${immunities.join(", ")}` : "",
        resistances.length ? `resists ${resistances.join(", ")}` : "",
        vulnerabilities.length ? `vulnerable to ${vulnerabilities.join(", ")}` : "",
      ].filter(Boolean)
      return words.length ? words.join(", ") : "no immunities, resistances or vulnerabilities"
    }
    const knownSpells = spellsOf(character)
    // The spells of theirs that take a Bonus Action and can be paid for now.
    const bonusSpells = knownSpells.filter((known) => known.spell.castingTime.unit === "bonus-action" && !("problem" in castCost(character, known.spell.id)))
    const slots = slotsLeft(character)
    // What kind of spell each is, so the game master knows who it is cast on.
    const spellKind = (spell: (typeof knownSpells)[number]["spell"]) =>
      spell.attack ? "a spell attack" : spell.saves ? "its targets save" : spell.healing ? "heals" : spell.damage ? "strikes with no roll" : isEngineSpell(spell) ? "lasts on its target" : "utility"
    const spellLines = knownSpells.map((known) => {
      const limit = targetLimit(known.spell)
      const notes = [
        known.cantrip ? "cantrip" : `level ${known.spell.level}`,
        spellKind(known.spell),
        // On a floor an area takes whoever stands in it, so its count is not the game master's to keep.
        ...(mover && known.spell.range.area ? ["an area"] : limit > 1 ? [`up to ${limit} creatures`] : []),
        ...(known.spell.ritual ? [known.prepared ? "ritual" : "ritual only"] : []),
        ...(known.free > 0 ? [`${known.free} free`] : []),
      ]
      return `${known.spell.id} (${known.spell.name}, ${notes.join(", ")})`
    })
    const casts = spellcastingAbilityOf(character)
    const contextLines = [
      `Name: ${character.name}`,
      `Archetype: ${character.archetype}`,
      `Race: ${character.race}`,
      conditions ? `Conditions: ${conditions}` : undefined,
      // What an NPC is written to be able to do beyond its stat block's spells, in words. It is no spell the game rolls.
      !character.sheet && character.spells && character.spells.length > 0 ? `Other magic, in the story's words: ${character.spells.map((entry) => entry.name).join(", ")}` : undefined,
      casts ? `Spellcasting ability: ${abilityById.get(casts)?.name}` : undefined,
      character.skills && character.skills.length > 0 ? `Skills: ${character.skills.join(", ")}` : undefined,
      character.equipment && character.equipment.length > 0 ? `Equipment: ${character.equipment.map((e) => `${e.name}${e.description ? ` (${e.description})` : ""}`).join(", ")}` : undefined,
      character.specialAbilities && character.specialAbilities.length > 0 ? `Special Abilities: ${character.specialAbilities.join(", ")}` : undefined,
      character.background ? `Background: ${character.background}` : undefined,
      character.personality ? `Personality: ${character.personality}` : undefined,
    ].filter(Boolean)
    const characterContext = contextLines.length > 0 ? `Character Context:\n${contextLines.join("\n")}\n` : ""

    const encounterContext =
      `${encounterIntro ? `Encounter Intro:\n${encounterIntro}\n` : ""}` +
      `${encounterInstructions ? `Encounter Instructions:\n${encounterInstructions}\n` : ""}` +
      `${narrativeContext ? `Recent Narrative Context:\n${narrativeContext}\n` : ""}`

    const prompt = `
${encounterContext}
${characterContext}

You are a Dungeon Master adjudicating whether a dice roll is needed. You pick the check, how hard it is, and whether the moment helps or hinders. The game adds the character's bonus and rolls the dice, so never work out a number yourself.

1) First, respect the encounter instructions. If they explicitly allow an action without checks (e.g., paying a stated fee) and the player follows that procedure plainly, choose no roll.
   A position, state or fact the action assumes, such as where someone is, holds only if the narrative shows it. Set the check and difficulty for the scene as the narrative shows it, not as the action pictures it.
${"type" in character && character.type === "npc" ? `${NPC_FIXED_OUTCOME}\n` : ""}
2) NEVER require rolls for basic social interactions between player characters, such as:
   - Simple introductions, greetings, or conversations
   - Approaching another party member to talk
   - Sharing information within the party
   - Basic cooperation or coordination
   These are fundamental party interactions that should always succeed automatically.

3) Default bias: prefer NO roll unless there is concrete uncertainty, opposition, concealment, meaningful risk, or real time pressure. Routine actions should succeed automatically.

4) Passive observation actions: Actions like "watching", "listening", "observing", "keeping watch", or "staying still and observing" are passive and do NOT require Stealth rolls. These are routine observation actions that succeed automatically. Only require Perception if there's something specific and hidden to notice, and only if the narrative context suggests uncertainty about noticing it.

5) Movement and routine actions: actions like paying a fee, approaching/following someone at a normal pace, or catching up in a non-hostile, ordinary environment should not require a roll unless the narrative clearly frames it as a chase or obstacle course. Paying a posted fee or routine handover, even with flair or charm, should not require a check.

6) Already obtained knowledge: If the narrative context shows a character already SUCCEEDED at a knowledge check (Arcana, History, Religion, Nature, etc.) and learned specific information, they do NOT need another roll to simply share or recall that information. Simply communicating already-known facts is automatic.

IMPORTANT: There are good and evil characters. This is an important aspect of rpg. Do not sanitize the action or the character's intent.

7) Otherwise, call for a roll when the outcome is uncertain, opposed, risky, concealed, time-sensitive, or dependent on skill. Pick the single most fitting check from this menu, by its id. Nothing off the menu can be rolled.

   Skills, the usual choice:
${MENU("skill")}

   Bare abilities, when no skill fits:
${MENU("ability")}

   Saving throws, when the character resists something done to them (a poison, a trap, a spell, a fall, a shove) rather than attempting something:
${MENU("save")}

   - stealth is for actively avoiding being seen or heard while moving or acting, not for passive observation.
   - sleight-of-hand ONLY when the player's text explicitly attempts theft, pickpocketing, palming or planting an item, a covert handoff, or concealed manipulation of an object against an observer. Do not infer theft intent from flourish, style, or glances.
   - acrobatics ONLY for agility and precision stunts (balancing across a narrow beam, tumbling through hostile space, leaping a gap, vaulting obstacles, slipping bonds). Not for normal movement like walking, jogging, or threading through an ordinary crowd.
   - perception to notice something specific and hidden, investigation to search or analyze evidence, insight to read motives.
   - Picking a lock or disarming a trap is "dexterity".
   - ATTACKS: when the character attacks a creature with a weapon, their fists or a natural weapon, "check" is "attack". "weapon" is the id of one of their own attacks and "target" is the id of who they attack, both from the lists below. The game rolls against the target's Armor Class and rolls the damage, so an attack takes no "difficulty". Never read an attack as a strength or dexterity check. An attack always gives both "weapon" and "target".
     Their attacks: ${attacks.map((attack) => `${attack.id} (${attack.name}, ${attack.kind === "melee-or-ranged" ? "melee or thrown" : attack.kind})`).join(", ") || "none"}.
     Who Is Here: ${targets.map((other) => `${other.id} (${[other.name, conditionWords(other), feetAway(other), lore(other)].filter(Boolean).join(", ")})`).join(", ") || "no one they could attack"}.
     If they name a weapon they do not have, pick the closest of their own attacks. If who they attack is not in Who Is Here, "check" is "none". Drawing, readying or resting a hand on a weapon is not an attack.
${
  "type" in character && character.type === "pc"
    ? `   - RESTS: when the party stops to rest and the scene is safe for it, "check" is "short-rest" (about an hour: binding wounds, catching breath) or "long-rest" (a night's sleep, in a safe place, when the story has the night to spare). The whole party rests, and the game gives back what a rest gives. Never during a fight or a chase, with danger at hand, or with something pressing that will not wait: then "check" is "none".
`
    : ""
}   - ACTIONS OF A FIGHT, only while a fight is on and only when it is the whole of what the character does this turn:
     "hide": they get out of sight to strike or slip away unseen. The game rolls stealth for it and sets its difficulty, so give none.
     "dodge": they give the turn to avoiding blows. "dash": they give it to covering ground. "disengage": they give it to backing out of reach. None of these is rolled.
     "help": they give the turn to aiding an ally, in a fight or out of one, and nothing is rolled. To aid an ally's next attack, "target" is the id of the enemy. To aid an ally's next check, "target" is the ally's id and "helps" is the skill's id.
     Sneaking past or after someone is "stealth", not "hide". Avoiding one hazard is a save, not "dodge". Running somewhere outside a fight is "none".
   - BONUS ACTIONS: beside the action above, the character may use one of their own Bonus Actions in the same turn. Set "bonus" to its id only when their words plainly use it, and leave it out otherwise. One given to someone else takes "bonusTarget", that ally's id.
     Their Bonus Actions: ${
       [
         ...bonusActions.map(
           (entry) =>
             `${entry.id} (${[entry.name, entry.left === undefined ? "" : entry.left > 0 ? `${entry.left} left` : `a level ${entry.slot} spell slot buys one`, entry.targeted ? "given to an ally" : ""].filter(Boolean).join(", ")})`
         ),
         ...bonusSpells.map((known) => `${known.spell.id} (${known.spell.name}, a spell cast with a Bonus Action${known.spell.range.kind === "self" ? "" : ', "bonusTarget" is who it is cast on'})`),
       ].join(", ") || "none"
     }.
     A spell cast with a Bonus Action goes in "bonus" when the character also does something else this turn, and in "check" as a "cast" when it is all they do.${
       bonusActions.some((entry) => entry.id.startsWith("cunning-action"))
         ? `
     Cunning Action is a Dash, Disengage or Hide taken as a Bonus Action, beside the action: a dash before a strike, slipping away after it, ducking out of sight after a shot.`
         : ""
     }${
       bonusActions.some((entry) => entry.id === "rogue-steady-aim")
         ? `
     rogue-steady-aim is for a character who holds still to aim before an attack this turn. It cannot be taken with a move.`
         : ""
     }
${
  surges
    ? `   - ACTION SURGE: "surge" is true when the player's words plainly push for one more action this turn, such as attacking again in a flurry, and the action is an attack. Leave it out otherwise.
`
    : ""
}${
  cunnings.length
    ? `   - CUNNING STRIKE: with an attack that may land a Sneak Attack, "cunning" is ${cunnings.map((id) => `"${id}"`).join(" or ")} when the player's words try to knock the target down. Leave it out otherwise.
`
    : ""
}${
  divinity.length
    ? `   - CHANNEL DIVINITY: when the character channels their god's power as the action, "check" is "channel-divinity" and "divinity" is one of: ${[
        divinity.includes("divine-spark-heal") ? '"divine-spark-heal" (heals one other creature, "targets" is who)' : "",
        divinity.includes("divine-spark-harm") ? '"divine-spark-harm" (radiant or necrotic harm on one creature, "targets" is who, "damageType" is "necrotic" or "radiant")' : "",
        divinity.includes("turn-undead") ? '"turn-undead" (turns the Undead nearby, "targets" are the Undead chosen)' : "",
        divinity.includes("preserve-life") ? '"preserve-life" (heals the badly hurt nearby, "targets" are who)' : "",
      ]
        .filter(Boolean)
        .join(", ")}. The game rolls it and spends a use. A spell is a "cast", not this.
`
    : ""
}   - SPELLS: when the character casts one of their own spells, "check" is "cast", "spell" is its id from Their Spells, and "targets" are the ids of everyone it is cast on, from Who Is Here or the character's own id${self ? `, ${self}` : ""}. The game knows every spell and rolls it, so a cast takes no "difficulty" and no "harm". A spell that takes several creatures names each of them. One that touches no creature, such as a light or a sensing, names no one.
     Their Spells: ${spellLines.join(", ") || "none"}.${slots.length ? ` Spell slots left: ${slotWords(character)}.` : ""}
     A cantrip spends nothing. Any other spell spends a slot of its level, or a higher one when none of its level is left, and with none left it cannot be cast. When the player says they cast it with a higher slot, "slot" is that slot's level. A spell marked ritual may be cast slowly with "ritual" true, outside a fight only, and then spends nothing.
     A spell that is not in Their Spells cannot be cast: "check" is "none". Magic that is no spell at all is "arcana".

8) Set "difficulty" by name. It is the task's own difficulty, the same for anyone who tries it. The character's talent is already in the bonus the game adds, so never lower or raise it for who is trying.
   - very-easy (target 5), easy (10), medium (15), hard (20), very-hard (25), nearly-impossible (30).
   - Most checks are easy or medium. Hard is a task that tests an expert. Very-hard and nearly-impossible are rare.
   - Encounter instructions that set a difficulty come first. A DC they give is its rung (DC 15 is medium). "Low" is easy, "medium" or "moderate" is medium, "high" is hard.

9) Set "mode" for the circumstances of this moment. Circumstances never change the difficulty.
   - "advantage" when something in the scene clearly helps: the target is distracted or unaware, darkness or noise covers a sneak, an ally is helping, the right tool is at hand.
   - "disadvantage" when something in the scene clearly hinders: a storm drowns what they listen for, they are hurt or held, they act blind or in a rush.
   - "normal" otherwise, which is most rolls. Say what helps or hinders in "reason", in a few words.
   - Not for what the character is good or bad at, and not for their armor or anyone's conditions: the game already counts those.

10) Set what the roll puts at stake for hit points, in "harm". Most rolls put none, so leave it empty. Use it only when this roll's own outcome would wound or heal someone:
   - An act that hurts someone when it works: on "success", target them, kind "damage".
   - A save or a check against a hazard that hurts when it fails (a trap, a fall, poison, fire): on "failure", target the character's own id, kind "damage".
   - A potion or a skill that heals: on "success", target who is healed, kind "healing".
   - "size" is light, moderate, heavy or severe, and the game rolls its dice. A scratch is light, a solid blow is moderate, a bad fall or a strong blast is heavy, and severe is rare. When the encounter instructions print dice for it (4d6), put them in "dice" as printed and leave "size" out.
   - "target" is an id from Who Is Here, or the character's own id${self ? `, ${self}` : ""}. Damage takes a "type": fire, cold, poison, psychic, bludgeoning and so on.
   - An attack takes no "harm": its weapon sets the damage. Never use damage for fear, shame, a threat, or a fight not yet joined.

11) "harm" also holds the conditions this roll's own outcome would give or end. Most rolls give none. The game knows these and applies their rules itself: ${conditionIds.join(", ")}.
   - An act that puts one on someone when it works (a trip or a shove knocks them prone, a hold leaves them grappled, a net or a snare leaves them restrained, a spell charms or frightens them): on "success", target them, kind "condition", and "condition" is its id.
   - A save against something that puts one on the character when it fails (a poison, a terror, a blinding flash, a snare): on "failure", target the character's own id, kind "condition".
   - An act that frees someone of one they have when it works (breaking a hold, tearing out of a net, shaking off fear): on "success", target who is freed, kind "end-condition". Only for a condition that Conditions or Who Is Here shows they have.
   - "span" is how long it lasts: "turn" is until their next turn is over, "minute" is the rest of a fight, "lasting" is until something ends it. Leave it out when unsure.
   - "source" is the id of who it comes from, for charmed, frightened and grappled.
   - Only what the rules call by one of those names. Never for being hurt, tired, surprised, hidden, distracted or off balance, and never because a roll simply fails.

${
  mover && floor
    ? `12) MOVING: a character moves before they act, and the game walks them and measures every distance. "moveTo" is where they go: the id of a place or of someone here, from Where Things Are. "moveAway" is instead the id of someone they back straight away from. Leave both out when they stay where they are. "moveFeet" is how far, when they do not go the whole way: a step is 5, and backing off or edging toward something is 10.
   - They can move ${moveBudget(mover, others)} feet this turn, and twice that when the whole turn is "dash".
   - A melee attack on someone out of reach closes with them by itself: it needs no "moveTo".
   - Never refuse or change an action because of distance. The game settles reach and range itself.
   - A spell marked "an area" takes whoever stands in it, friend or foe: in "targets" give the one it is aimed at first, and for a spell that picks its creatures, each one picked.
   - The game reads cover from the walls and furniture of the place. Set "cover" only for something the story put between the two that the place does not hold.
     Where Things Are, from where the character stands:
     Places: ${floor.places.map((place) => `${place.id} (${place.label}, ${Math.round(Math.hypot(place.at.x - (mover.position?.x ?? 0), place.at.y - (mover.position?.y ?? 0)))} feet away)`).join(", ") || "none named"}.
     Everyone here: ${others.flatMap((other) => (other.position ? [`${other.id} (${other.name}, ${feetAway(other)})`] : [])).join(", ") || "no one"}.

`
    : ""
}If NO roll is required and no action of a fight is taken, "check" is "none".

Action: "${action}"
`

    console.log("[LLM] Roll requirement prompt:", { promptLength: prompt.length, action, character: character.name })

    try {
      // The roller's own attacks, spells and Bonus Actions are menus for this read: the game master takes an id off
      // the list. The site's model once made up a weapon id, and once wrote its thinking into one.
      const menu = (key: "weapon" | "spell" | "bonus" | "moveTo" | "moveAway", ids: string[]) =>
        ids.length
          ? z
              .enum(ids as [string, ...string[]])
              .optional()
              .describe(rollPickSchema.shape[key].description ?? "")
          : rollPickSchema.shape[key]
      const schema = rollPickSchema.extend({
        // The features chosen in the moment are on the menu only while the hero has them and can use them.
        ...(divinity.length
          ? {
              check: z.enum([...rollPickSchema.shape.check.options, "channel-divinity"]).describe(rollPickSchema.shape.check.description ?? ""),
              divinity: z
                .enum(divinity as [string, ...string[]])
                .optional()
                .describe('For "channel-divinity": the Channel Divinity effect used'),
            }
          : {}),
        ...(surges ? { surge: z.boolean().optional().describe("True when the player's words use Action Surge for one more action this turn") } : {}),
        ...(cunnings.length
          ? {
              cunning: z
                .enum(cunnings as [string, ...string[]])
                .optional()
                .describe("For an attack: the Cunning Strike effect added to a Sneak Attack"),
            }
          : {}),
        spell: menu(
          "spell",
          knownSpells.map((known) => known.spell.id)
        ),
        weapon: menu(
          "weapon",
          attacks.map((attack) => attack.id)
        ),
        bonus: menu("bonus", [...bonusActions.map((entry) => entry.id), ...bonusSpells.map((known) => known.spell.id)]),
        // Where they may go: the floor's named places and the others on it.
        ...(mover && floor
          ? {
              moveTo: menu("moveTo", [...floor.places.map((place) => place.id), ...others.flatMap((other) => (other.position ? [other.id] : []))]),
              moveAway: menu(
                "moveAway",
                others.flatMap((other) => (other.position ? [other.id] : []))
              ),
            }
          : {}),
      })
      // Where there is no floor to move on, the game master is not asked where anyone goes.
      const asked = (mover && floor ? schema : schema.omit({ moveTo: true, moveAway: true, moveFeet: true, cover: true })) as unknown as typeof rollPickSchema
      const { object: read } = await generateObject({ schema: asked, prompt })
      // What the menus built for this read add to the pick.
      const pick = read as typeof read & { check: string; divinity?: string; surge?: boolean; cunning?: string }
      // A Bonus Action is the roller's own, with a use left. One the game master makes up is dropped.
      const used = bonusActions.find((entry) => entry.id === pick.bonus?.trim())
      // A spell cast with a Bonus Action, beside the action. Only one spell a turn takes a slot, so beside a cast it is dropped.
      const quick = pick.check === "cast" ? undefined : bonusSpells.find((known) => known.spell.id === pick.bonus?.trim() || known.spell.name.toLowerCase() === pick.bonus?.trim().toLowerCase())
      // What the reading carries beside its roll: a Bonus Action, the move, and a ruling of space.
      const also: Pick<TurnReading, "bonus" | "move" | "ruling" | "surge"> = used
        ? { bonus: { feature: used.id, ...(used.targeted && pick.bonusTarget ? { target: pick.bonusTarget } : {}) } }
        : quick
          ? { bonus: { feature: quick.spell.id, ...(pick.bonusTarget ? { target: pick.bonusTarget } : {}) } }
          : {}
      // The move, made before the action: to the place or the one named, or away from one. With Dash the whole turn is
      // movement. An attack in melee may close with its target instead, which is settled where the attack is.
      const ask: MoveAsk = { to: pick.moveTo?.trim() || undefined, away: pick.moveAway?.trim() || undefined, feet: pick.moveFeet }
      // Dash, as the action or with Cunning Action.
      const dash = pick.check === "dash" || used?.id === "cunning-action-dash"
      const moveFor = (close?: { target: string; reach: number }) => (mover && floor ? takeMove({ floor, mover, others, ask, dash, close }) : undefined)
      const moved = (move: Moved | undefined) => {
        if (move) also.move = move
        else delete also.move
        return move
      }
      moved(moveFor())
      // Whether an enemy stands within 5 feet of the roller, up and able to act: a ranged attack then has Disadvantage.
      const pressed = (who: typeof character) => {
        const from = floor ? placedOf(who) : undefined
        return (
          !!from &&
          others.some((other) => {
            const at = placedOf(other)
            return !!at && other.type !== character.type && !isDown(other) && !isIncapacitated(other) && within(from, at, 5)
          })
        )
      }
      // A name is taken for its id, in a weapon, a spell or a target.
      const named = (given: string | undefined, name: string, id: string) => !!given?.trim() && [id.toLowerCase(), name.toLowerCase()].includes(given.trim().toLowerCase())
      if (pick.check === "cast") {
        // A spell is one of the caster's own, with a slot for it. One the caster lacks, or cannot pay for, is not cast.
        const known = knownSpells.find((entry) => named(pick.spell, entry.spell.name, entry.spell.id))
        // A slot named that the caster lacks, or below the spell's level, falls to the lowest that can pay.
        const cost = known && castCost(character, known.spell.id, pick.ritual === true, pick.slot)
        if (!known || !cost || "problem" in cost) {
          console.log("[LLM] Roll requirement decision:", {
            character: character.name,
            requiresRoll: false,
            cast: pick.spell,
            refused: cost && "problem" in cost ? cost.problem : "not one of their spells",
          })
          return { roll: null, ...also }
        }
        const { spell } = known
        const everyone = (options?.present ?? []).filter((other) => !isDead(other) && !hasFled(other))
        const asked = [...(pick.targets ?? []), ...(pick.target ? [pick.target] : [])]
        // On a floor an area is measured, so those named are its aim and not its count.
        let chosen = [...new Set(asked.flatMap((given) => everyone.find((other) => named(given, other.name, other.id))?.id ?? []))].slice(
          0,
          mover && spell.range.area ? undefined : targetLimit(spell, cost.cost.kind === "slot" ? cost.cost.level : spell.level)
        )
        // No one named: a spell on the caster alone is theirs, a spell attack lands on the only foe here, and healing is the caster's own.
        if (!chosen.length) {
          if (spell.attack && targets.length === 1) chosen = [targets[0].id]
          else if (self && ((spell.range.kind === "self" && !spell.range.area) || spell.healing)) chosen = [self]
        }
        const falls = !!(spell.attack || spell.saves || spell.damage || spell.healing || spell.conditions)
        if (falls && !chosen.length) {
          console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, cast: spell.id, refused: "no one here to cast it on" })
          return { roll: null, ...also }
        }
        // Space, on a floor. A touch closes with the one touched, as a melee attack does. Then the spell falls where
        // everyone stands: within its range, past no total cover, and on whoever is in its area.
        const touched = spell.range.kind === "touch" && chosen[0] !== self ? chosen[0] : undefined
        const stood = withMove(character, moved(moveFor(touched ? { target: touched, reach: 5 } : undefined)))
        const spaced = mover && floor ? castInSpace({ spell, caster: { ...stood, id: mover.id }, everyone, named: chosen, floor }) : undefined
        if (spaced?.problem) {
          also.ruling = spaced.problem
          console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, ...also })
          return { roll: null, ...also }
        }
        if (spaced) chosen = spaced.targets
        const type = damageTypeIdSchema.safeParse(pick.damageType?.trim().toLowerCase())
        const forSkill = skillIdSchema.safeParse(pick.helps?.trim().toLowerCase())
        const cast = {
          spell: spell.id,
          targets: chosen,
          ...(spaced && Object.keys(spaced.cover).length ? { cover: spaced.cover } : {}),
          ...(spaced?.measured ? { measured: true as const } : {}),
          ...(cost.cost.kind === "ritual" ? { ritual: true as const } : {}),
          ...(type.success ? { damageType: type.data } : {}),
          ...(forSkill.success ? { skill: forSkill.data } : {}),
          // The slot level spent, for a hero. An NPC's stat block may print the level it casts at.
          ...(cost.cost.kind === "slot" ? { level: cost.cost.level } : known.castLevel ? { level: known.castLevel } : {}),
        }
        const casting = spellcastingOf(character)
        if (spell.attack) {
          // A spell attack is the caster's to throw, against the first target's Armor Class.
          const target = everyone.find((other) => other.id === chosen[0])
          const armorClass = target && combatStatsOf(target)?.armorClass
          if (!target || armorClass === undefined || !casting) throw new Error(`${spell.name} has no one with an Armor Class to be cast at.`)
          const picked = pick.mode ?? "normal"
          const typed = [
            ...(self ? [...spellAttackModes({ ...stood, id: self }, { ...target, type: target.type ?? "npc" }, spell), ...attackModesFromSpells(character, target)] : []),
            // A ranged spell attack has Disadvantage with an enemy within 5 feet who is up and able to act.
            ...(spell.attack === "ranged" && pressed(stood) ? [{ mode: "disadvantage" as const, from: "Enemy Within 5 Feet" }] : []),
          ]
          const reasons = [...(picked !== "normal" && pick.reason?.trim() ? [pick.reason.trim()] : []), ...typed.map((source) => source.from)]
          const rollRequirement: ChosenRoll = {
            cast,
            rollType: spell.name,
            difficulty: armorClass + coverBonus(spaced?.cover[target.id] ?? "none"),
            modifier: casting.attackBonus,
            mode: combineModes([picked, ...typed.map((source) => source.mode)]),
            ...(reasons.length ? { reasons } : {}),
          }
          console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: true, ...rollRequirement })
          return { roll: rollRequirement, ...also }
        }
        const resolved: RequiredCast = { cast, rollType: spell.name, difficulty: casting?.saveDc ?? 0, modifier: 0, mode: "normal" }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, cast })
        return { roll: null, cast: resolved, ...also }
      }
      if (pick.check === "attack") {
        // The pick names a weapon and a target off the two lists, by id. One left out is settled where only one could
        // be meant: the roller's only attack, and for a target the only one here, the one the Bonus Action is aimed
        // at, or the only one the action's own words name.
        const attack = attacks.find((entry) => named(pick.weapon, entry.name, entry.id)) ?? (!pick.weapon?.trim() && attacks.length === 1 ? attacks[0] : undefined)
        const said = new Set(action.toLowerCase().match(/[\w'-]+/g) ?? [])
        const spoken = targets.filter((other) => (other.name.toLowerCase().match(/[\w'-]+/g) ?? []).some((word) => !["the", "a", "an", "of"].includes(word) && said.has(word)))
        const meant = targets.length === 1 ? targets[0] : (targets.find((other) => named(pick.bonusTarget, other.name, other.id)) ?? (spoken.length === 1 ? spoken[0] : undefined))
        const target = targets.find((other) => named(pick.target, other.name, other.id)) ?? (pick.target?.trim() ? undefined : meant)
        if (!attack) throw new Error(`The game master asked for an attack with "${pick.weapon ?? ""}", which ${character.name} does not have.`)
        if (!target) throw new Error(`The game master asked for an attack on "${pick.target ?? ""}", who is not here to attack.`)
        if (combatStatsOf(target)?.armorClass === undefined) throw new Error(`${target.name} has no sheet or stat block to attack.`)
        // Space, where the encounter has a floor and the two stand on it. A melee attack on one out of reach closes with them first, as far as the
        // move goes. A weapon that can be thrown is thrown from where they stand when the target is in its range and no
        // move was named. Then the distance is measured: out of reach and range, the attack is not made.
        const apart = floor ? feetBetween(character, target) : undefined
        const throws =
          attack.range &&
          apart !== undefined &&
          !ask.to &&
          !ask.away &&
          attackReach({ distance: apart, range: attack.range }) !== "out" &&
          attackReach({ distance: apart, reach: attack.reach }) === "out"
        const stood = withMove(character, moved(moveFor(attack.reach !== undefined && !throws ? { target: target.id, reach: attack.reach } : undefined)))
        // Steady Aim: Advantage on this attack for one who has not moved this turn. With a move it cannot be taken.
        const aiming = used?.id === "rogue-steady-aim" && !also.move
        // Action Surge: the Attack action again, with all its attacks.
        const surge = surges && pick.surge === true
        if (surge) also.surge = true
        const cunning = cunnings.find((id) => id === pick.cunning)
        const made = attackRequirement({
          character: { ...stood, id: self ?? character.name, name: character.name, type: character.type ?? "pc" } as InScene,
          target: target as InScene,
          attack,
          present: (options?.present ?? []) as InScene[],
          floor: floor && mover ? floor : undefined,
          mode: pick.mode,
          reason: pick.reason,
          cover: pick.cover,
          modes: aiming ? [{ mode: "advantage", from: "Steady Aim" }] : [],
          moved: also.move?.feet,
          cunning,
          after: self ? attackAfter({ ...stood, id: self, name: character.name } as InScene, { surge }) : undefined,
        })
        if ("ruling" in made) {
          also.ruling = made.ruling
          delete also.surge
          console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, ...also })
          return { roll: null, ...also }
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: true, ...made.roll })
        return { roll: made.roll, ...also }
      }
      // Channel Divinity, used as the action: resolved with no throw of the hero's, as a spell that asks for none.
      if (pick.check === "channel-divinity" && divinity.length) {
        const chosen = divinity.find((id) => id === pick.divinity)
        if (!chosen) return { roll: null, ...also }
        const effect: DivinityEffect = chosen.startsWith("divine-spark") ? "divine-spark" : (chosen as DivinityEffect)
        const everyone = (options?.present ?? []).filter((other) => !isDead(other) && !hasFled(other))
        const given: string[] = [...(pick.targets ?? []), ...(pick.target ? [pick.target] : [])].flatMap((asked) => everyone.find((other) => named(asked, other.name, other.id))?.id ?? [])
        // Turn Undead takes the Undead named, or every Undead near when none is.
        const targets = effect === "turn-undead" ? given.filter((id) => isUndead(everyone.find((other) => other.id === id) ?? {})) : given
        const damageType = pick.damageType?.trim().toLowerCase()
        const feature: RequiredFeature = {
          feature: {
            id: effect,
            targets,
            ...(chosen === "divine-spark-heal" ? { heal: true as const } : {}),
            ...(chosen === "divine-spark-harm" && (damageType === "necrotic" || damageType === "radiant") ? { damageType } : {}),
          },
          rollType: chosen === "divine-spark-heal" || chosen === "divine-spark-harm" ? "Divine Spark" : effect === "turn-undead" ? "Turn Undead" : "Preserve Life",
          difficulty: spellcastingOf(character)?.saveDc ?? 0,
          modifier: 0,
          mode: "normal",
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: feature.feature })
        return { roll: null, feature, ...also }
      }
      // A rest, which only a hero asks for: the engine gives it to the whole party as the reading is applied.
      if ((pick.check === "short-rest" || pick.check === "long-rest") && "type" in character && character.type === "pc") {
        const rest: RestKind = pick.check === "long-rest" ? "long" : "short"
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, rest })
        return { roll: null, rest, ...also }
      }
      const here = new Set((options?.present ?? []).filter((other) => !isDead(other) && !hasFled(other)).map((other) => other.id))
      // An action that takes no roll. Help names who it is for, and for a check the skill.
      const taken = actionIds.find((id) => id === pick.check)
      if (taken) {
        const skill = skillIdSchema.safeParse(pick.helps?.trim().toLowerCase())
        const helped = pick.target && pick.target !== self && here.has(pick.target) ? pick.target : undefined
        const read: TakenAction | undefined = taken !== "help" ? { action: taken } : helped ? { action: taken, target: helped, ...(skill.success ? { skill: skill.data } : {}) } : undefined
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, action: read })
        return { roll: null, ...(read ? { action: read } : {}), ...also }
      }
      // Hide is a Stealth check the rules set: its target and what a success gives are the engine's.
      const hiding = pick.check === "hide" && self ? hideRoll({ ...character, id: self }) : undefined
      const check = hiding ? hiding.check : pick.check === "none" || pick.check === "hide" ? undefined : checkFromMenu(pick.check)
      if (!check) {
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, ...also })
        return { roll: null, ...also }
      }
      const difficulty = hiding ? HIDE_DC : pick.difficulty && DIFFICULTY_CLASSES[pick.difficulty]
      if (!difficulty) throw new Error(`The game master asked for a ${checkName(check)} check with no difficulty.`)

      // The game master's read of the moment, then what the sheet and the roller's conditions settle with no model.
      // Every source is kept as a reason, so a roll that Advantage and Disadvantage cancel can still say why.
      const typed = [
        ...sheetModes(character, check),
        ...checkModesFrom(character, check, options?.present),
        ...(self ? checkModesFromActions({ ...character, id: self }, check, options?.present) : []),
      ]
      const picked = pick.mode ?? "normal"
      const mode = combineModes([picked, ...typed.map((source) => source.mode)])
      const reasons = [...(picked !== "normal" && pick.reason?.trim() ? [pick.reason.trim()] : []), ...typed.map((source) => source.from)]
      // The stakes, each off the menus: who, the dice by size or as the notes print them, and the damage type, or a
      // condition by its id. One that names no one here, neither a size nor printed dice, or no condition the rules
      // have, is dropped.
      const picks: Stake[] = (pick.harm ?? []).flatMap((entry): Stake[] => {
        if (!here.has(entry.target)) return []
        if (entry.kind === "condition" || entry.kind === "end-condition") {
          const condition = conditionIdSchema.safeParse(entry.condition?.trim().toLowerCase())
          if (!condition.success) return []
          if (entry.kind === "end-condition") return [{ on: entry.on, target: entry.target, kind: "condition", condition: condition.data, ends: true }]
          // Who it comes from, where the rules turn on that: the one named, or the roller when it lands on someone else.
          const from = entry.source && here.has(entry.source) && entry.source !== entry.target ? entry.source : entry.target !== self ? self : undefined
          const source = CONDITION_RULES[condition.data].source ? from : undefined
          return [{ on: entry.on, target: entry.target, kind: "condition", condition: condition.data, ...(entry.span ? { span: entry.span } : {}), ...(source ? { source } : {}) }]
        }
        if (entry.kind !== "damage" && entry.kind !== "healing") return []
        const printed = printedDiceSchema.safeParse(entry.dice?.trim())
        const dice = printed.success ? printed.data : entry.size ? HARM_DICE[entry.size] : undefined
        if (!dice) return []
        const type = damageTypeIdSchema.safeParse(entry.type?.trim().toLowerCase())
        return [{ on: entry.on, target: entry.target, kind: entry.kind, dice, ...(entry.kind === "damage" && type.success ? { type: type.data } : {}) }]
      })
      const stakes = hiding?.stakes ?? picks
      const rollRequirement: ChosenRoll = {
        check,
        rollType: hiding ? hiding.rollType : checkName(check),
        difficulty,
        modifier: checkBonus(character, check),
        mode,
        ...(reasons.length ? { reasons } : {}),
        ...(stakes.length ? { stakes } : {}),
      }
      console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: true, ...rollRequirement })
      return { roll: rollRequirement, ...also }
    } catch (error) {
      console.error("[LLM] Roll requirement error:", {
        character: character.name,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
  return { getRollRequirementForAction, readAction }
}
