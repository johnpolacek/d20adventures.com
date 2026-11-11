import raw from "../data/abilities.json"
import { byId } from "./lookup"
import type { Ability } from "./schema/reference"

export const abilities = raw as unknown as readonly Ability[]
export const abilityById = byId(abilities)
