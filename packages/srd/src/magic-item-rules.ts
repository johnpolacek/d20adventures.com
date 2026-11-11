import raw from "../data/magic-item-rules.json"
import { byId } from "./lookup"
import type { MagicItemRule } from "./schema/magic-items"

export const magicItemRules = raw as unknown as readonly MagicItemRule[]
export const magicItemRuleById = byId(magicItemRules)
