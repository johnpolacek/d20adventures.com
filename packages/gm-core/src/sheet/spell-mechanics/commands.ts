import { masterOf } from "../masters"
import { withSpellEffect } from "../spell-effects"
import type { Bearer, SpellRules } from "../spell-rules"

/**
 * Spells that command a creature, and the turns they rule (../spell-rules `rulesTurn`, ../ruled-turns). A dominated
 * creature acts for its master while the spell lasts (../masters): an NPC's turn is written by the model that writes
 * NPC turns, told whom it obeys, and a hero's is played for them, told the same (../../services/ai-pc-turn-service).
 * Command's word and Fear's flight are plain rules on the bearer's next turn: the engine moves them and ends the turn.
 */

// "If it completes an order and doesn't receive further direction from you, it acts and moves as it likes, focusing on protecting itself."
const PROTECTS_ITSELF = "it acts and moves as it likes, focusing on protecting itself"

/**
 * Dominate Beast, Dominate Person and Dominate Monster: a target that fails "has the Charmed condition for the
 * duration. ... On your turn, you can use this link to issue commands to the target (no action required) ... The target
 * does its best to obey on its turn." It acts for its caster, on their side, until the spell ends.
 */
export const dominated: SpellRules = {
  spells: ["dominate-beast", "dominate-person", "dominate-monster"],
  failedSave: (cast, target) => {
    const now = cast.find(target.id)
    if (!now || !now.conditions?.some((entry) => entry.id === "charmed" && entry.spell === cast.spell.id)) return
    cast.put({ ...now, master: masterOf(cast.caster as Parameters<typeof masterOf>[0], cast.spell.id) } as typeof now)
    cast.facts.push(
      `${target.name} is dominated by ${cast.caster.name}: on their turns they do their best to obey ${cast.caster.name}'s commands, and act for ${cast.caster.name}'s side${target.type === "pc" ? ". Their player does not choose what they do while it lasts" : ""}.`
    )
  },
  idle: PROTECTS_ITSELF,
}

const COMMANDS = ["approach", "drop", "flee", "grovel", "halt"] as const
type Word = (typeof COMMANDS)[number]
const WORDS: Record<Word, string> = { approach: "Approach", drop: "Drop", flee: "Flee", grovel: "Grovel", halt: "Halt" }

// The command one bears, and who spoke it, while it waits for their next turn.
const commandOn = (bearer: Bearer) => bearer.spellEffects?.find((effect) => effect.spell === "command")

/**
 * Command: "The target must succeed on a Wisdom saving throw or follow the command on its next turn." Approach: "The
 * target moves toward you by the shortest and most direct route, ending its turn if it moves within 5 feet of you."
 * Drop: "The target drops whatever it is holding and then ends its turn." Flee: "The target spends its turn moving away
 * from you by the fastest available means", the Dash action. Grovel: "The target has the Prone condition and then ends
 * its turn." Halt: "On its turn, the target doesn't move and takes no action or Bonus Action." The word is kept on an
 * effect on the target until its next turn is over. Grovel's Prone is given as the save fails, and Approach's turn ends
 * after the move even where it stops short.
 */
export const command: SpellRules = {
  spells: ["command"],
  choice: { values: COMMANDS, field: "spellChoice", words: "the one-word command" },
  held: { placed: true },
  failedSave: (cast, target) => {
    const now = cast.find(target.id)
    if (!now) return
    cast.put(withSpellEffect(now, { spell: "command", by: cast.caster.id, turns: 1 + (now.isComplete ? 1 : 0), choice: cast.choice ?? "halt" }))
    cast.facts.push(`${target.name} must follow the command "${WORDS[(cast.choice ?? "halt") as Word]}" on their next turn.`)
    if (cast.choice === "grovel") cast.give(target.id, "prone", "lasting")
  },
  rulesTurn: (bearer, characters) => {
    const held = commandOn(bearer)
    if (!held) return undefined
    const by = characters.find((other) => other.id === held.by)?.name ?? "the caster"
    const word = (held.choice ?? "halt") as Word
    const text = {
      approach: `${bearer.name} obeys ${by}'s command "Approach" and moves toward them by the most direct route, and their turn ends.`,
      drop: `${bearer.name} obeys ${by}'s command "Drop": they drop whatever they are holding, and their turn ends.`,
      flee: `${bearer.name} obeys ${by}'s command "Flee": they take the Dash action and move away from ${by} as fast as they can.`,
      grovel: `${bearer.name} obeys ${by}'s command "Grovel": they lie Prone, and their turn ends.`,
      halt: `${bearer.name} obeys ${by}'s command "Halt": they do not move and take no action or Bonus Action.`,
    }[word]
    return {
      name: "Command",
      text,
      ...(word === "approach" ? { move: { to: held.by } } : word === "flee" ? { move: { away: held.by }, dash: true as const } : {}),
    }
  },
}

/**
 * Fear: "A Frightened creature takes the Dash action and moves away from you by the safest route on each of its turns
 * unless there is nowhere to move." Its turn is that flight while it is Frightened by the spell.
 */
export const fearFlight: SpellRules = {
  spells: ["fear"],
  rulesTurn: (bearer, characters) => {
    const fear = bearer.conditions?.find((entry) => entry.id === "frightened" && entry.spell === "fear")
    if (!fear) return undefined
    const by = characters.find((other) => other.id === fear.source)?.name ?? "the caster"
    return { name: "Fear", text: `${bearer.name} is Frightened by ${by}'s Fear: they take the Dash action and flee from ${by} by the safest route.`, move: { away: fear.source }, dash: true }
  },
}

export const commands: SpellRules[] = [dominated, command, fearFlight]
