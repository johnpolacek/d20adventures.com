// Stageview: the painted 3D encounter stage. See wiki/plans/stageview.md.

export { type NarrationShot, type NarrationStage, narrationShot } from "./narration"
export { DEFAULT_FLAGS, type Flags, TIER_NAMES, TIERS, type TierName } from "./quality"
export { buildSetGeometry, parseSet, populateCrowd, SetBuildError } from "./spec/build"
export { LIMITS, type SetSpec, type SetSpecInput, setSpecSchema } from "./spec/set"
export { type StagingSpec, type StagingSpecInput, stagingSpecSchema } from "./spec/staging"
export { createStage, defaultCrowdLibrary, Stage, type StageOptions, type StageStats } from "./stage"
