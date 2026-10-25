import type { TurnCharacter } from "../types/adventure"

// Words that make an authored line an absolute rule. The model breaks these first: given a gruff foreman, it had him
// tell the heroes to move along, though the notes said he never sends them away.
const ABSOLUTE = /\b(?:never|nothing|no one|silent|wordless)\b/i

const literal = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const isOut = (c: TurnCharacter) => c.healthPercent === 0 || c.status === "dead" || c.status === "fled"

// The sentences of a block of notes, without markdown.
function sentences(text: string): string[] {
  return text
    .replace(/\*\*|__|`/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:#+|[-*]|\d+\.)\s*/, "").trim())
    .flatMap((line) => line.split(/(?<=[.!?]["”]?)\s+(?=["“]?[A-Z])/))
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The sentences of an encounter's GM notes that open with this NPC's name and set an absolute rule, such as what they
 * never do. A sentence that only mentions them is about something else. The NPC's turn reads the notes whole, but a
 * rule inside a paragraph about something else lost to the model's idea of the character. A first name shared with another character in the scene, such as Silverhand and Silverhand
 * Representative, counts only in full.
 */
export function npcNoteRules(notes: string | undefined, npc: Pick<TurnCharacter, "id" | "name">, characters: readonly Pick<TurnCharacter, "id" | "name">[] = []): string[] {
  if (!notes?.trim() || !npc.name.trim()) return []
  const first = npc.name.trim().split(/\s+/)[0]
  const shared = characters.some((c) => c.id !== npc.id && c.name.trim().split(/\s+/)[0] === first)
  const names = [npc.name.trim(), ...(first.length > 2 && first !== npc.name.trim() && !shared ? [first] : [])]
  const named = new RegExp(`^(?:${names.map(literal).join("|")})\\b`)
  return [...new Set(sentences(notes).filter((s) => named.test(s) && ABSOLUTE.test(s)))]
}

/** The NPC prompt's block for those sentences, or nothing. */
export function npcNoteRulesNote(notes: string | undefined, npc: Pick<TurnCharacter, "id" | "name">, characters: readonly Pick<TurnCharacter, "id" | "name">[] = []): string {
  const rules = npcNoteRules(notes, npc, characters)
  return rules.length
    ? `RULES THE ENCOUNTER INSTRUCTIONS SET FOR ${npc.name.toUpperCase()}. Each holds as written, whatever the NPC Behavior or the moment suggests:\n${rules.map((r) => `- ${r}`).join("\n")}`
    : ""
}

/**
 * The absolute rules in the behavior of each NPC still in the scene, for a GM prompt that may write their words or
 * deeds. Only an NPC's own turn read its behavior, so a round end gave Silverhand, who "says nothing", a line when a
 * hero spoke to him. Behavior with no such rule is left out.
 */
export function castRulesNote(characters: readonly TurnCharacter[]): string {
  const rules = characters.filter((c) => c.type === "npc" && !isOut(c) && c.behavior && ABSOLUTE.test(c.behavior)).map((c) => `- ${c.name}: ${c.behavior!.trim()}`)
  return rules.length
    ? `HOW THESE NPCS ACT. It binds every word and deed you give them, whoever speaks to them. One who says nothing has no lines, and answers a question with a look or a gesture at most:\n${rules.join("\n")}`
    : ""
}
