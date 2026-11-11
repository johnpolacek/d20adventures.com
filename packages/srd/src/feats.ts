import raw from "../data/feats.json"
import { byId } from "./lookup"
import type { Feat } from "./schema/origins"

export const feats = raw as unknown as readonly Feat[]
export const featById = byId(feats)
