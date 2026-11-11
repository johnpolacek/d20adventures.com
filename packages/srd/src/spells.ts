import raw from "../data/spells.json"
import { byId } from "./lookup"
import type { Spell } from "./schema/spells"

export const spells = raw as unknown as readonly Spell[]
export const spellById = byId(spells)
