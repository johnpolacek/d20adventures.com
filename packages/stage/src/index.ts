// Stageview: the painted 3D encounter stage..

export { DEFAULT_FLAGS, type Flags, TIER_NAMES, TIERS, type TierName } from "./quality"
export type { BodyAct, BodyEvent, EffectEvent, EffectKind, Element, PropKind, Voice } from "./effects"
export type { Surface } from "./surface"
export { buildSetGeometry, parseSet, populateCrowd, SetBuildError } from "./spec/build"
export { AMBIENCE_BEDS, type AmbienceBed, LIMITS, type SetSpec, type SetSpecInput, setSpecSchema } from "./spec/set"
export { type StagingSpec, type StagingSpecInput, stagingSpecSchema } from "./spec/staging"
export { createStage, defaultCrowdLibrary, Stage, type StageOptions, type StageStats } from "./stage"
