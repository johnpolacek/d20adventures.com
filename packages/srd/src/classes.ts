import raw from "../data/classes.json"
import { byId } from "./lookup"
import type { Class } from "./schema/classes"

export const classes = raw as unknown as readonly Class[]
export const classById = byId(classes)
