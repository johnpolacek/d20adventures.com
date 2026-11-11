import raw from "../data/species.json"
import { byId } from "./lookup"
import type { Species } from "./schema/origins"

export const species = raw as unknown as readonly Species[]
export const speciesById = byId(species)
