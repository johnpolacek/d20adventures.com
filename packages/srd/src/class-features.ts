import raw from "../data/class-features.json"
import { byId } from "./lookup"
import type { ClassFeature } from "./schema/classes"

export const classFeatures = raw as unknown as readonly ClassFeature[]
export const classFeatureById = byId(classFeatures)
