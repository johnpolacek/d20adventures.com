import raw from "../data/origin-rules.json"
import { byId } from "./lookup"
import type { OriginRule } from "./schema/origins"

export const originRules = raw as unknown as readonly OriginRule[]
export const originRuleById = byId(originRules)
