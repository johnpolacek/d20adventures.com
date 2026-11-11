import raw from "../data/monster-rules.json"
import { byId } from "./lookup"
import type { MonsterRule } from "./schema/monsters"

export const monsterRules = raw as unknown as readonly MonsterRule[]
export const monsterRuleById = byId(monsterRules)
