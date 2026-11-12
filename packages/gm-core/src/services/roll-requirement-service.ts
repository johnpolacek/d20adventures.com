import { conditionIdSchema, conditionIds, damageTypeIdSchema, skillIdSchema } from "@d20/srd"
import { abilityById } from "@d20/srd/abilities"
import { z } from "zod"
import type { GmPorts } from "../ports"
import { attackModesFromActions, checkModesFromActions, HIDE_DC, hideRoll, type TakenAction } from "../sheet/actions"
import { attacksOf } from "../sheet/attack"
import { checkBonus, checkFromMenu, checkMenu, checkMenuIds, checkName, combineModes, DIFFICULTY_CLASSES, difficulties, rollModes, sheetModes, spellcastingAbilityOf } from "../sheet/check"
import { conditionSpans } from "../sheet/condition-entry"
import { attackModesFrom, CONDITION_RULES, cannotAttack, checkModesFrom, conditionWords } from "../sheet/conditions"
import { bonusActionsOf } from "../sheet/features"
import { HARM_DICE, harmSizes, printedDiceSchema, type Stake } from "../sheet/stakes"
import { combatStatsOf } from "../sheet/stat-block"
import { actionIds } from "../sheet/turn-effect"
import type { TurnCharacter } from "../types/adventure"
import type { Character } from "../types/character"
import { hasFled, isDead, isDown } from "../utils/turn-actors"
import type { ChosenRoll } from "../validations/roll-requirement-schema"
import { formatSpellsForPrompt } from "./spell-tracking-service"

// An NPC whose action the notes fix rolls nothing. Mara's lift "always happens" unless a hero spots it, yet she rolled
// Sleight of Hand, failed, and the theft the scene turns on never happened.
const NPC_FIXED_OUTCOME =
  "   This character is an NPC. When the encounter instructions say what this NPC does here always happens or works, or that only a hero's check or choice can stop it, choose no roll: the NPC does not roll against an outcome the notes fix."

// What the game master picks, each from a fixed menu. The engine works out the rest: the bonus from the roller's sheet
// or stat block, the target number from the difficulty's name, and the dice.
const rollPickSchema = z.object({
  check: z
    .enum(["none", "attack", "hide", ...actionIds, ...checkMenuIds])
    .describe('The check\'s id from the menu, "attack" for an attack, an action of a fight ("hide", "dodge", "help", "dash", "disengage"), or "none" when nothing is rolled'),
  difficulty: z.enum(difficulties).optional().describe("How hard the task is, by name. Needed for every check"),
  mode: z.enum(rollModes).optional().describe('"advantage" or "disadvantage" when this moment\'s circumstances clearly help or hinder, else "normal"'),
  reason: z.string().max(120).optional().describe("What gives the Advantage or Disadvantage, in a few words"),
  spell: z.string().max(80).optional().describe("The character's own spell this roll casts, exactly as their spell list names it"),
  weapon: z.string().max(80).optional().describe("For an attack: the id of one of the character's own attacks"),
  target: z.string().max(80).optional().describe('For an attack: the id of who is attacked, from Who Is Here. For "help": the id of the ally helped, or of the enemy an ally will attack'),
  helps: z.string().max(40).optional().describe('For "help" given to an ally\'s check: the id of the skill it is for'),
  bonus: z.string().max(40).optional().describe("The id of one of the character's own Bonus Actions they also use this turn, from Their Bonus Actions"),
  bonusTarget: z.string().max(80).optional().describe("For a Bonus Action given to someone else: their id"),
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
  Partial<Pick<TurnCharacter, "type" | "sheet" | "hitPoints" | "healthPercent" | "dead" | "fled" | "conditions" | "turnEffects" | "isComplete">> & { statBlock?: string }

/** What the game master reads a character's move as: a roll the engine asks for, an action that takes none, or neither. */
export type TurnReading = { roll: ChosenRoll | null; action?: TakenAction /** One of the roller's own Bonus Actions, used beside the action. */; bonus?: { feature: string; target?: string } }

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
  }
  /** The roll a move asks for, where only the roll is wanted: an action that takes none is read as no roll. */
  const getRollRequirementForAction = async (action: string, character: Character, options?: Options): Promise<ChosenRoll | null> => (await readAction(action, character, options)).roll

  async function readAction(action: string, character: Character, options?: Options): Promise<TurnReading> {
    const { encounterInstructions = "", encounterIntro = "", narrativeContext = "" } = options || {}
    const self = "id" in character ? character.id : undefined
    // One who is Charmed cannot attack the charmer.
    const targets = (options?.present ?? []).filter((other) => other.id !== self && !isDown(other) && !hasFled(other) && !cannotAttack(character, other))
    const conditions = conditionWords(character)
    const attacks = attacksOf(character)
    const bonusActions = bonusActionsOf(character).filter((entry) => entry.left > 0)
    const casts = spellcastingAbilityOf(character)
    const contextLines = [
      `Name: ${character.name}`,
      `Archetype: ${character.archetype}`,
      `Race: ${character.race}`,
      conditions ? `Conditions: ${conditions}` : undefined,
      character.spells && character.spells.length > 0 ? `Spells: ${formatSpellsForPrompt(character as unknown as TurnCharacter)}` : undefined,
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
   - ATTACKS: when the character attacks a creature with a weapon, their fists or a natural weapon, "check" is "attack". "weapon" is the id of one of their own attacks and "target" is the id of who they attack, both from the lists below. The game rolls against the target's Armor Class and rolls the damage, so an attack takes no "difficulty". Never read an attack as a strength or dexterity check.
     Their attacks: ${attacks.map((attack) => `${attack.id} (${attack.name}, ${attack.kind === "melee-or-ranged" ? "melee or thrown" : attack.kind})`).join(", ") || "none"}.
     Who Is Here: ${targets.map((other) => `${other.id} (${[other.name, conditionWords(other)].filter(Boolean).join(", ")})`).join(", ") || "no one they could attack"}.
     If they name a weapon they do not have, pick the closest of their own attacks. If who they attack is not in Who Is Here, "check" is "none". Drawing, readying or resting a hand on a weapon is not an attack.
   - ACTIONS OF A FIGHT, only while a fight is on and only when it is the whole of what the character does this turn:
     "hide": they get out of sight to strike or slip away unseen. The game rolls stealth for it and sets its difficulty, so give none.
     "dodge": they give the turn to avoiding blows. "dash": they give it to covering ground. "disengage": they give it to backing out of reach. None of these is rolled.
     "help": they give the turn to aiding an ally, in a fight or out of one, and nothing is rolled. To aid an ally's next attack, "target" is the id of the enemy. To aid an ally's next check, "target" is the ally's id and "helps" is the skill's id.
     Sneaking past or after someone is "stealth", not "hide". Avoiding one hazard is a save, not "dodge". Running somewhere outside a fight is "none".
   - BONUS ACTIONS: beside the action above, the character may use one of their own Bonus Actions in the same turn. Set "bonus" to its id only when their words plainly use it, and leave it out otherwise. One given to someone else takes "bonusTarget", that ally's id.
     Their Bonus Actions: ${bonusActions.map((entry) => `${entry.id} (${entry.name}, ${entry.left} left${entry.targeted ? ", given to an ally" : ""})`).join(", ") || "none"}.
   - SPELLS: casting one of the character's own spells is a bare check of their spellcasting ability (see Character Context. For an NPC, the ability its magic comes from: intelligence, wisdom or charisma), and "spell" names the spell exactly as their list has it. Magic that is not a spell on their list is "arcana" with no "spell".
   - SPELL AVAILABILITY: Spells marked as "Used (unavailable this encounter)" CANNOT be cast again until the next encounter. If the character tries to cast one, "check" is "none": the spell simply fails to activate.

8) Set "difficulty" by name. It is the task's own difficulty, the same for anyone who tries it. The character's talent is already in the bonus the game adds, so never lower or raise it for who is trying.
   - very-easy (target 5), easy (10), medium (15), hard (20), very-hard (25), nearly-impossible (30).
   - Most checks are easy or medium. Hard is a task that tests an expert. Very-hard and nearly-impossible are rare.
   - Encounter instructions that set a difficulty come first. A DC they give is its rung (DC 15 is medium). "Low" is easy, "medium" or "moderate" is medium, "high" is hard.
   - A spell on the character's own list that no creature resists (it makes fog, light or sound, moves an object, or senses or reads something: Fog Cloud, Light, Mage Hand, Detect Magic, Comprehend Languages) is very-easy. A spell that works against a creature's mind or body (Charm Person, Ray of Frost) is easy, medium or hard by how strong the creature is.

9) Set "mode" for the circumstances of this moment. Circumstances never change the difficulty.
   - "advantage" when something in the scene clearly helps: the target is distracted or unaware, darkness or noise covers a sneak, an ally is helping, the right tool is at hand.
   - "disadvantage" when something in the scene clearly hinders: a storm drowns what they listen for, they are hurt or held, they act blind or in a rush.
   - "normal" otherwise, which is most rolls. Say what helps or hinders in "reason", in a few words.
   - Not for what the character is good or bad at, and not for their armor or anyone's conditions: the game already counts those.

10) Set what the roll puts at stake for hit points, in "harm". Most rolls put none, so leave it empty. Use it only when this roll's own outcome would wound or heal someone:
   - A spell or an act that hurts someone when it works: on "success", target them, kind "damage".
   - A save or a check against a hazard that hurts when it fails (a trap, a fall, poison, fire): on "failure", target the character's own id, kind "damage".
   - A spell, a potion or a skill that heals: on "success", target who is healed, kind "healing".
   - "size" is light, moderate, heavy or severe, and the game rolls its dice. A scratch or a cantrip is light, a solid blow or a level 1 spell is moderate, a bad fall or a strong blast is heavy, and severe is rare. When the encounter instructions print dice for it (4d6), put them in "dice" as printed and leave "size" out.
   - "target" is an id from Who Is Here, or the character's own id${self ? `, ${self}` : ""}. Damage takes a "type": fire, cold, poison, psychic, bludgeoning and so on.
   - An attack takes no "harm": its weapon sets the damage. Never use damage for fear, shame, a threat, or a fight not yet joined.

11) "harm" also holds the conditions this roll's own outcome would give or end. Most rolls give none. The game knows these and applies their rules itself: ${conditionIds.join(", ")}.
   - An act that puts one on someone when it works (a trip or a shove knocks them prone, a hold leaves them grappled, a net or a snare leaves them restrained, a spell charms or frightens them): on "success", target them, kind "condition", and "condition" is its id.
   - A save against something that puts one on the character when it fails (a poison, a terror, a blinding flash, a snare): on "failure", target the character's own id, kind "condition".
   - An act that frees someone of one they have when it works (breaking a hold, tearing out of a net, shaking off fear): on "success", target who is freed, kind "end-condition". Only for a condition that Conditions or Who Is Here shows they have.
   - "span" is how long it lasts: "turn" is until their next turn is over, "minute" is the rest of a fight, "lasting" is until something ends it. Leave it out when unsure.
   - "source" is the id of who it comes from, for charmed, frightened and grappled.
   - Only what the rules call by one of those names. Never for being hurt, tired, surprised, hidden, distracted or off balance, and never because a roll simply fails.

If NO roll is required and no action of a fight is taken, "check" is "none".

Action: "${action}"
`

    console.log("[LLM] Roll requirement prompt:", { promptLength: prompt.length, action, character: character.name })

    try {
      const { object: pick } = await generateObject({ schema: rollPickSchema, prompt })
      // A Bonus Action is the roller's own, with a use left. One the game master makes up is dropped.
      const used = bonusActions.find((entry) => entry.id === pick.bonus?.trim())
      const bonus = used ? { bonus: { feature: used.id, ...(used.targeted && pick.bonusTarget ? { target: pick.bonusTarget } : {}) } } : {}
      if (pick.check === "attack") {
        const attack = attacks.find((entry) => entry.id === pick.weapon)
        const target = targets.find((other) => other.id === pick.target)
        if (!attack) throw new Error(`The game master asked for an attack with "${pick.weapon ?? ""}", which ${character.name} does not have.`)
        if (!target) throw new Error(`The game master asked for an attack on "${pick.target ?? ""}", who is not here to attack.`)
        const armorClass = combatStatsOf(target)?.armorClass
        if (armorClass === undefined) throw new Error(`${target.name} has no sheet or stat block to attack.`)
        // The game master's read of the moment, then what the conditions of the two settle with no model.
        const picked = pick.mode ?? "normal"
        const typed = [...attackModesFrom(character, target, attack.kind, options?.present), ...(self ? attackModesFromActions({ ...character, id: self }, target, options?.present) : [])]
        const reasons = [...(picked !== "normal" && pick.reason?.trim() ? [pick.reason.trim()] : []), ...typed.map((source) => source.from)]
        const rollRequirement: ChosenRoll = {
          attack: { weapon: attack.id, target: target.id },
          rollType: attack.name,
          difficulty: armorClass,
          modifier: attack.bonus,
          mode: combineModes([picked, ...typed.map((source) => source.mode)]),
          ...(reasons.length ? { reasons } : {}),
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: true, ...rollRequirement })
        return { roll: rollRequirement, ...bonus }
      }
      const here = new Set((options?.present ?? []).filter((other) => !isDead(other) && !hasFled(other)).map((other) => other.id))
      // An action that takes no roll. Help names who it is for, and for a check the skill.
      const taken = actionIds.find((id) => id === pick.check)
      if (taken) {
        const skill = skillIdSchema.safeParse(pick.helps?.trim().toLowerCase())
        const helped = pick.target && pick.target !== self && here.has(pick.target) ? pick.target : undefined
        const read: TakenAction | undefined = taken !== "help" ? { action: taken } : helped ? { action: taken, target: helped, ...(skill.success ? { skill: skill.data } : {}) } : undefined
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, action: read })
        return { roll: null, ...(read ? { action: read } : {}), ...bonus }
      }
      // Hide is a Stealth check the rules set: its target and what a success gives are the engine's.
      const hiding = pick.check === "hide" && self ? hideRoll({ ...character, id: self }) : undefined
      const check = hiding ? hiding.check : pick.check === "none" || pick.check === "hide" ? undefined : checkFromMenu(pick.check)
      if (!check) {
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, ...bonus })
        return { roll: null, ...bonus }
      }
      const difficulty = hiding ? HIDE_DC : pick.difficulty && DIFFICULTY_CLASSES[pick.difficulty]
      if (!difficulty) throw new Error(`The game master asked for a ${checkName(check)} check with no difficulty.`)

      // A spell is named only when it is one of the roller's own.
      const spell = pick.spell?.trim() ? character.spells?.find((entry) => entry.name.toLowerCase() === pick.spell?.trim().toLowerCase())?.name : undefined
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
        rollType: hiding ? hiding.rollType : spell ? `${spell} (${checkName(check)})` : checkName(check),
        difficulty,
        modifier: checkBonus(character, check),
        mode,
        ...(reasons.length ? { reasons } : {}),
        ...(spell ? { spell } : {}),
        ...(stakes.length ? { stakes } : {}),
      }
      console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: true, ...rollRequirement })
      return { roll: rollRequirement, ...bonus }
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
