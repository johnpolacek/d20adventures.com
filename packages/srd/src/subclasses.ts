import raw from "../data/subclasses.json"
import { byId } from "./lookup"
import type { Subclass } from "./schema/classes"

export const subclasses = raw as unknown as readonly Subclass[]
export const subclassById = byId(subclasses)
