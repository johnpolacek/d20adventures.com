import { ownBlockOf } from "../blocks"
import type { SpellRules } from "../spell-rules"

/** Shatter: "A Construct has Disadvantage on the save." */
export const shatter: SpellRules = {
  spells: ["shatter"],
  saveModes: (target) => (!target.sheet && target.type === "npc" && ownBlockOf(target)?.type === "construct" ? [{ mode: "disadvantage", from: "Construct" }] : []),
}
