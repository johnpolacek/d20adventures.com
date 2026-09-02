// What every builder needs: materials, randomness, the shared clock, and the fire
// system to hang flames on. Sets construct one from their SetContext.

import type { FireSystem } from "../atmosphere"
import type { Rng } from "../core"
import type { MaterialLibrary } from "../materials"
import type { TimeUniform } from "../shaders"

export interface BuilderContext {
  materials: MaterialLibrary
  rng: Rng
  time: TimeUniform
  fire: FireSystem
}
