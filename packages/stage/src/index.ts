// Stageview: the painted 3D encounter stage..

export { DEFAULT_FLAGS, type Flags, TIER_NAMES, TIERS, type TierName } from "./quality"
export type { EffectEvent, EffectKind, Element, PropKind } from "./effects"
export { buildSetGeometry, parseSet, populateCrowd, SetBuildError } from "./spec/build"
export { AMBIENCE_BEDS, type AmbienceBed, LIMITS, type SetSpec, type SetSpecInput, setSpecSchema } from "./spec/set"
export { type StagingSpec, type StagingSpecInput, stagingSpecSchema } from "./spec/staging"
export { createStage, defaultCrowdLibrary, Stage, type StageOptions, type StageStats } from "./stage"
