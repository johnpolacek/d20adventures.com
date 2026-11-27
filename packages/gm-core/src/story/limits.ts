import type { TurnCharacter } from "../types/adventure"
import { hasFled, isDown } from "../utils/turn-actors"

const isOut = (c: TurnCharacter) => isDown(c) || hasFled(c)
const SILENT_RULE = "Never speaks aloud: no spoken lines, answers at most with a look or a gesture."

type LimitNpc = Pick<TurnCharacter, "id" | "name"> & { silent?: boolean; limits?: readonly string[] }

/**
 * Explicit hard limits authored on this NPC in the encounter frontmatter (`silent` and `limits`).
 * No regex or prose scraping: every constraint is declared directly as structured data.
 */
export function npcLimits(npc: LimitNpc): string[] {
  const rules = [...(npc.silent ? [SILENT_RULE] : []), ...(npc.limits ?? []).map((rule) => rule.trim()).filter(Boolean)]
  return [...new Set(rules)]
}

/** The NPC turn prompt's block for that NPC's explicit limits, or nothing. */
export function npcLimitsNote(npc: LimitNpc): string {
  const rules = npcLimits(npc)
  return rules.length
    ? `HARD LIMITS FOR ${npc.name.toUpperCase()}. Each holds as written, whatever the NPC Behavior or the moment suggests:\n${rules.map((r) => `- ${r}`).join("\n")}`
    : ""
}

/**
 * Explicit limits for every live NPC in the scene, for GM prompts outside an NPC's own turn
 * (round ends and roll outcomes) that may write an NPC's words or deeds.
 */
export function castLimitsNote(characters: readonly TurnCharacter[]): string {
  const lines = characters
    .filter((c): c is Extract<TurnCharacter, { type: "npc" }> => c.type === "npc" && !isOut(c))
    .flatMap((c) => {
      const rules = npcLimits(c)
      return rules.length ? [`- ${c.name}: ${rules.join(" ")}`] : []
    })
  return lines.length
    ? `HARD LIMITS ON THESE NPCS. They bind every word and deed you give them, whoever speaks to them:\n${lines.join("\n")}`
    : ""
}
