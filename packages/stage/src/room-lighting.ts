import type { SetSpec } from "./spec/set"

export type RoomSpec = SetSpec["rooms"][number]
export type AtmosphereSpec = SetSpec["atmosphere"]

export type RoomLightingState<R = RoomSpec> =
  | { kind: "outdoors" }
  | { kind: "indoors"; room: R }
  | { kind: "transition"; from: R | null; to: R | null; progress: number }

export interface RoomLightingSample {
  hemisphereIntensity: number
  environmentIntensity: number
  fillIntensity: number | null
  exposure: number
  lights: AtmosphereSpec["lights"]
  lightScale: number
}

const CROSSFADE_RATE = 3

interface LightEndpoint {
  hemisphereIntensity: number
  environmentIntensity: number
  fillIntensity: number | null
  exposure: number
  lights: AtmosphereSpec["lights"]
}

function endpointFor(atmosphere: AtmosphereSpec, room: Pick<RoomSpec, "ambient" | "fill" | "exposure" | "lights"> | null): LightEndpoint {
  if (!room) {
    return {
      hemisphereIntensity: atmosphere.hemisphere.intensity,
      environmentIntensity: atmosphere.environment,
      fillIntensity: atmosphere.fill ? atmosphere.fill.intensity : null,
      exposure: atmosphere.exposure,
      lights: atmosphere.lights,
    }
  }
  return {
    hemisphereIntensity: atmosphere.hemisphere.intensity * room.ambient,
    environmentIntensity: atmosphere.environment * room.ambient,
    fillIntensity: atmosphere.fill ? (room.fill ?? atmosphere.fill.intensity * room.ambient) : null,
    exposure: room.exposure ?? atmosphere.exposure,
    lights: room.lights,
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Explicit lighting crossfade machine between outdoors and rooms (including direct room-to-room transitions).
 * Smoothly interpolates hemisphere/environment/fill/exposure and dims outgoing lamps out before bringing
 * incoming lamps up, preventing 1-frame lighting snaps when walking directly from room A into room B.
 */
export class RoomLightingController<R extends Pick<RoomSpec, "ambient" | "fill" | "exposure" | "lights"> = RoomSpec> {
  private _state: RoomLightingState<R> = { kind: "outdoors" }

  constructor(private readonly atmosphere: AtmosphereSpec) {}

  get state(): RoomLightingState<R> {
    return this._state
  }

  /**
   * Advances lighting toward `inside` (`null` for outdoors).
   * Returns a `RoomLightingSample` to apply whenever lighting changed this frame, or `null` when settled.
   */
  step(inside: R | null, dt: number, motion: boolean): RoomLightingSample | null {
    const st = this._state

    // Already settled at target -> no work needed.
    if (st.kind === "outdoors" && inside === null) return null
    if (st.kind === "indoors" && inside === st.room) return null

    // Begin or redirect a transition when target changed.
    let from: R | null
    let to: R | null
    let progress: number

    if (st.kind === "outdoors") {
      from = null
      to = inside
      progress = 0
    } else if (st.kind === "indoors") {
      from = st.room
      to = inside
      progress = 0
    } else if (inside === st.to) {
      from = st.from
      to = st.to
      progress = st.progress
    } else if (inside === st.from) {
      // Smooth reversal back to the previous space.
      from = st.to
      to = st.from
      progress = 1 - st.progress
    } else if (st.progress < 0.5) {
      // Outgoing lamps still dominate: continue dimming them toward the new destination.
      from = st.from
      to = inside
      progress = st.progress
    } else {
      // Incoming lamps already dominate: fade them back down from their current intensity toward the new destination.
      from = st.to
      to = inside
      progress = 1 - st.progress
    }

    const next = motion ? Math.min(1, progress + Math.max(0, dt) * CROSSFADE_RATE) : 1
    const a = endpointFor(this.atmosphere, from)
    const b = endpointFor(this.atmosphere, to)

    const sample: RoomLightingSample = {
      hemisphereIntensity: lerp(a.hemisphereIntensity, b.hemisphereIntensity, next),
      environmentIntensity: lerp(a.environmentIntensity, b.environmentIntensity, next),
      fillIntensity: a.fillIntensity !== null && b.fillIntensity !== null ? lerp(a.fillIntensity, b.fillIntensity, next) : null,
      exposure: lerp(a.exposure, b.exposure, next),
      lights: next < 0.5 ? a.lights : b.lights,
      lightScale: next < 0.5 ? 1 - 2 * next : 2 * next - 1,
    }

    if (next >= 1) {
      this._state = to ? { kind: "indoors", room: to } : { kind: "outdoors" }
    } else {
      this._state = { kind: "transition", from, to, progress: next }
    }

    return sample
  }
}
