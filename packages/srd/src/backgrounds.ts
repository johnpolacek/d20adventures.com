import raw from "../data/backgrounds.json"
import { byId } from "./lookup"
import type { Background } from "./schema/origins"

export const backgrounds = raw as unknown as readonly Background[]
export const backgroundById = byId(backgrounds)
