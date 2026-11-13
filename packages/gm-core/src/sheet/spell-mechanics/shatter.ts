import { monsterById } from "@d20/srd/monsters"
import type { SpellRules } from "../spell-rules"
import { DEFAULT_STAT_BLOCK } from "../stat-block"

/** Shatter: "A Construct has Disadvantage on the save." */
export const shatter: SpellRules = {
  spells: ["shatter"],
  saveModes: (target) => (!target.sheet && target.type === "npc" && monsterById.get(target.statBlock ?? DEFAULT_STAT_BLOCK)?.type === "construct" ? [{ mode: "disadvantage", from: "Construct" }] : []),
}
