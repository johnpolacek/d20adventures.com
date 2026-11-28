// Explicit lifecycle state machine for Stage: coordinates initialization, cancellable asset loading,
// shader/frame warming, active rendering, multi-reason suspension, and terminal disposal.

export type SuspendReason = "paused" | "offscreen" | "hidden"

export type StageLifecycle =
  | { kind: "initializing" }
  | { kind: "loading"; abort: AbortController }
  | { kind: "warming"; framesLeft: number }
  | { kind: "active" }
  | { kind: "suspended"; reasons: ReadonlySet<SuspendReason>; framesLeft: number }
  | { kind: "disposed" }

export const WARMUP_FRAMES = 3

export class StageLifecycleController {
  private _state: StageLifecycle = { kind: "initializing" }
  private readonly reasons = new Set<SuspendReason>()
  private readonly controller = new AbortController()

  get state(): StageLifecycle {
    return this._state
  }

  /** Shared abort signal aborted as soon as the stage is disposed. */
  get signal(): AbortSignal {
    return this.controller.signal
  }

  /** True when the animation loop should be running. */
  get shouldRun(): boolean {
    return this._state.kind === "warming" || this._state.kind === "active"
  }

  /** True once warmup frames have completed (even if subsequently suspended). */
  get isReady(): boolean {
    return this._state.kind === "active" || (this._state.kind === "suspended" && this._state.framesLeft === 0)
  }

  get isDisposed(): boolean {
    return this._state.kind === "disposed"
  }

  /** Transitions from `initializing` to `loading` and returns the abort signal, or `null` if already disposed. */
  beginLoad(): AbortSignal | null {
    if (this._state.kind === "disposed") return null
    if (this._state.kind === "initializing") {
      this._state = { kind: "loading", abort: this.controller }
    }
    return this.controller.signal
  }

  /** Transitions from `loading` into `warming` (or `suspended` if any suspend reason is active). */
  finishLoad(warmupFrames = WARMUP_FRAMES): boolean {
    if (this._state.kind !== "loading" || this.controller.signal.aborted) return false
    const frames = Math.max(0, warmupFrames)
    if (this.reasons.size > 0) {
      this._state = { kind: "suspended", reasons: new Set(this.reasons), framesLeft: frames }
    } else if (frames > 0) {
      this._state = { kind: "warming", framesLeft: frames }
    } else {
      this._state = { kind: "active" }
    }
    return true
  }

  /** Records a rendered frame during `warming`. Returns `true` on the exact frame that completes warmup. */
  onFrameRendered(): boolean {
    if (this._state.kind !== "warming") return false
    const next = this._state.framesLeft - 1
    if (next <= 0) {
      this._state = { kind: "active" }
      return true
    }
    this._state = { kind: "warming", framesLeft: next }
    return false
  }

  /** Adds or removes a suspension reason (`paused`, `offscreen`, `hidden`). */
  setSuspended(reason: SuspendReason, active: boolean): void {
    if (this._state.kind === "disposed") return
    if (active) this.reasons.add(reason)
    else this.reasons.delete(reason)

    if (this._state.kind === "initializing" || this._state.kind === "loading") return

    if (this.reasons.size > 0) {
      const framesLeft = this._state.kind === "warming" ? this._state.framesLeft : this._state.kind === "suspended" ? this._state.framesLeft : 0
      this._state = { kind: "suspended", reasons: new Set(this.reasons), framesLeft }
    } else if (this._state.kind === "suspended") {
      this._state = this._state.framesLeft > 0 ? { kind: "warming", framesLeft: this._state.framesLeft } : { kind: "active" }
    }
  }

  /** Terminal transition: aborts in-flight loads and prevents any future rendering or state transitions. */
  dispose(): void {
    if (this._state.kind === "disposed") return
    this._state = { kind: "disposed" }
    this.reasons.clear()
    this.controller.abort()
  }
}
