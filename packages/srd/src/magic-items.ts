import raw from "../data/magic-items.json"
import { byId } from "./lookup"
import type { MagicItem } from "./schema/magic-items"

export const magicItems = raw as unknown as readonly MagicItem[]
export const magicItemById = byId(magicItems)
