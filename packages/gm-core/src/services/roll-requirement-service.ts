import { abilityById } from "@d20/srd/abilities"
import { z } from "zod"
import type { GmPorts } from "../ports"
import { attacksOf } from "../sheet/attack"
import { checkBonus, checkFromMenu, checkMenu, checkMenuIds, checkName, combineModes, DIFFICULTY_CLASSES, difficulties, rollModes, sheetModes, spellcastingAbilityOf } from "../sheet/check"
import { combatStatsOf } from "../sheet/stat-block"
import type { TurnCharacter } from "../types/adventure"
import type { Character } from "../types/character"
import { isDown } from "../utils/turn-actors"
import type { ChosenRoll } from "../validations/roll-requirement-schema"
import { formatSpellsForPrompt } from "./spell-tracking-service"

// An NPC whose action the notes fix rolls nothing. Mara's lift "always happens" unless a hero spots it, yet she rolled
// Sleight of Hand, failed, and the theft the scene turns on never happened.
const NPC_FIXED_OUTCOME =
  "   This character is an NPC. When the encounter instructions say what this NPC does here always happens or works, or that only a hero's check or choice can stop it, choose no roll: the NPC does not roll against an outcome the notes fix."

// What the game master picks, each from a fixed menu. The engine works out the rest: the bonus from the roller's sheet
// or stat block, the target number from the difficulty's name, and the dice.
const rollPickSchema = z.object({
  check: z.enum(["none", "attack", ...checkMenuIds]).describe('The check\'s id from the menu, "attack" for an attack, or "none" when nothing is rolled'),
  difficulty: z.enum(difficulties).optional().describe("How hard the task is, by name. Needed for every check"),
  mode: z.enum(rollModes).optional().describe('"advantage" or "disadvantage" when this moment\'s circumstances clearly help or hinder, else "normal"'),
  reason: z.string().max(120).optional().describe("What gives the Advantage or Disadvantage, in a few words"),
  spell: z.string().max(80).optional().describe("The character's own spell this roll casts, exactly as their spell list names it"),
  weapon: z.string().max(80).optional().describe("For an attack: the id of one of the character's own attacks"),
  target: z.string().max(80).optional().describe("For an attack: the id of who is attacked, from Who Is Here"),
})

// Someone the roller could attack: anyone else in the scene who is still up.
type Present = { id: string; name: string; type?: string; sheet?: TurnCharacter["sheet"]; statBlock?: string; healthPercent?: number; status?: string }

const MENU = (kind: "skill" | "ability" | "save") =>
  checkMenu
    .filter((entry) => entry.check.kind === kind)
    .map((entry) => `   - ${entry.id}: ${entry.name}. ${entry.uses}.`.replace(/\.\.$/, "."))
    .join("\n")

export function createRollRequirementService(ports: GmPorts) {
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  async function getRollRequirementForAction(
    action: string,
    character: Character,
    options?: {
      encounterInstructions?: string
      encounterIntro?: string
      narrativeContext?: string
      // Everyone in the scene. The roller can attack any of the others who is still up.
      present?: readonly Present[]
    }
  ): Promise<ChosenRoll | null> {
    const { encounterInstructions = "", encounterIntro = "", narrativeContext = "" } = options || {}
    const self = "id" in character ? character.id : undefined
    const targets = (options?.present ?? []).filter((other) => other.id !== self && !isDown(other) && other.status !== "fled")
    const attacks = attacksOf(character)
    const casts = spellcastingAbilityOf(character)
    const contextLines = [
      `Name: ${character.name}`,
      `Archetype: ${character.archetype}`,
      `Race: ${character.race}`,
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
     Who Is Here: ${targets.map((other) => `${other.id} (${other.name})`).join(", ") || "no one they could attack"}.
     If they name a weapon they do not have, pick the closest of their own attacks. If who they attack is not in Who Is Here, "check" is "none". Drawing, readying or resting a hand on a weapon is not an attack.
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
   - Not for what the character is good or bad at, and not for their armor: the game already counts both.

If NO roll is required, "check" is "none".

Action: "${action}"
`

    console.log("[LLM] Roll requirement prompt:", { promptLength: prompt.length, action, character: character.name })

    try {
      const { object: pick } = await generateObject({ schema: rollPickSchema, prompt })
      if (pick.check === "attack") {
        const attack = attacks.find((entry) => entry.id === pick.weapon)
        const target = targets.find((other) => other.id === pick.target)
        if (!attack) throw new Error(`The game master asked for an attack with "${pick.weapon ?? ""}", which ${character.name} does not have.`)
        if (!target) throw new Error(`The game master asked for an attack on "${pick.target ?? ""}", who is not here to attack.`)
        const armorClass = combatStatsOf(target)?.armorClass
        if (armorClass === undefined) throw new Error(`${target.name} has no sheet or stat block to attack.`)
        const picked = pick.mode ?? "normal"
        const rollRequirement: ChosenRoll = {
          attack: { weapon: attack.id, target: target.id },
          rollType: attack.name,
          difficulty: armorClass,
          modifier: attack.bonus,
          mode: picked,
          ...(picked !== "normal" && pick.reason?.trim() ? { reasons: [pick.reason.trim()] } : {}),
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: true, ...rollRequirement })
        return rollRequirement
      }
      const check = pick.check === "none" ? undefined : checkFromMenu(pick.check)
      if (!check) {
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false })
        return null
      }
      if (!pick.difficulty) throw new Error(`The game master asked for a ${checkName(check)} check with no difficulty.`)

      // A spell is named only when it is one of the roller's own.
      const spell = pick.spell?.trim() ? character.spells?.find((entry) => entry.name.toLowerCase() === pick.spell?.trim().toLowerCase())?.name : undefined
      // The game master's read of the moment, then what the sheet settles with no model. Every source is kept as a
      // reason, so a roll that Advantage and Disadvantage cancel can still say why.
      const typed = sheetModes(character, check)
      const picked = pick.mode ?? "normal"
      const mode = combineModes([picked, ...typed.map((source) => source.mode)])
      const reasons = [...(picked !== "normal" && pick.reason?.trim() ? [pick.reason.trim()] : []), ...typed.map((source) => source.from)]
      const rollRequirement: ChosenRoll = {
        check,
        rollType: spell ? `${spell} (${checkName(check)})` : checkName(check),
        difficulty: DIFFICULTY_CLASSES[pick.difficulty],
        modifier: checkBonus(character, check),
        mode,
        ...(reasons.length ? { reasons } : {}),
        ...(spell ? { spell } : {}),
      }
      console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: true, ...rollRequirement })
      return rollRequirement
    } catch (error) {
      console.error("[LLM] Roll requirement error:", {
        character: character.name,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
  return { getRollRequirementForAction }
}
