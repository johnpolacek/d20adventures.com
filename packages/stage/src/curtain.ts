// Owns canvas opacity transitions for both painted-point cuts and unseen-placement dips.
// Explicit state: lit | fadingToDark | dark | disposed.

export type CurtainPhase = "lit" | "fadingToDark" | "dark" | "disposed"

export type CurtainTarget = {
  style: {
    opacity: string
    transition: string
  }
}

export class ScreenCurtain {
  private _phase: CurtainPhase = "lit"
  private cutPending: { onDark: () => void; timer: ReturnType<typeof setTimeout> } | null = null
  private dipDark: { promise: Promise<boolean>; resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> } | null = null
  private dipLiftTimer: ReturnType<typeof setTimeout> | null = null
  private fadeMs: number
  private darkWaitMs: number
  private liftWaitMs: number

  constructor(
    private readonly target: CurtainTarget,
    opts?: { fadeMs?: number; darkWaitMs?: number; liftWaitMs?: number }
  ) {
    this.fadeMs = opts?.fadeMs ?? 170
    this.darkWaitMs = opts?.darkWaitMs ?? 190
    this.liftWaitMs = opts?.liftWaitMs ?? 90
  }

  get phase(): CurtainPhase {
    return this._phase
  }

  get dipping(): boolean {
    return this.dipDark !== null || this.dipLiftTimer !== null
  }

  get cutting(): boolean {
    return this.cutPending !== null
  }

  get active(): boolean {
    return this.dipping || this.cutting
  }

  /**
   * Dips the canvas to dark for unseen placements (e.g. card repositioning) and lifts after `liftWaitMs`.
   * Resolves `true` while dark, or `false` if disposed before reaching dark.
   */
  dip(): Promise<boolean> {
    if (this._phase === "disposed") return Promise.resolve(false)
    if (!this.dipDark) {
      this.fadeOut()
      let resolve!: (ok: boolean) => void
      const promise = new Promise<boolean>((r) => {
        resolve = r
      })
      const timer = setTimeout(() => {
        if (this._phase === "disposed") return
        this._phase = "dark"
        resolve(true)
      }, this.darkWaitMs)
      this.dipDark = { promise, resolve, timer }
    }
    const current = this.dipDark
    return current.promise.then((ok) => {
      if (!ok || this._phase === "disposed") return false
      if (this.dipLiftTimer !== null) clearTimeout(this.dipLiftTimer)
      this.dipLiftTimer = setTimeout(() => {
        this.dipLiftTimer = null
        if (this.dipDark === current) this.dipDark = null
        this.tryLift()
      }, this.liftWaitMs)
      return true
    })
  }

  /**
   * Begins a fade-to-dark camera cut. `onDark` runs once dark (or immediately if `finishCut()` is called).
   */
  beginCut(onDark: () => void) {
    if (this._phase === "disposed") return
    this.cancelCut()
    this.fadeOut()
    const run = () => {
      if (this._phase === "disposed") return
      this.cutPending = null
      this._phase = "dark"
      onDark()
      this.tryLift()
    }
    const timer = setTimeout(run, this.darkWaitMs)
    this.cutPending = { onDark: run, timer }
  }

  /** Finishes an active cut immediately, invoking its arrival callback synchronously. */
  finishCut(): boolean {
    if (!this.cutPending || this._phase === "disposed") return false
    const pending = this.cutPending
    clearTimeout(pending.timer)
    this.cutPending = null
    pending.onDark()
    return true
  }

  /** Cancels a pending cut without invoking its arrival callback. */
  cancelCut() {
    if (!this.cutPending) return
    clearTimeout(this.cutPending.timer)
    this.cutPending = null
    this.tryLift()
  }

  /** Restores canvas opacity if no cut or dip is currently holding it dark. */
  liftIfIdle() {
    this.tryLift()
  }

  dispose() {
    if (this._phase === "disposed") return
    this._phase = "disposed"
    if (this.cutPending) {
      clearTimeout(this.cutPending.timer)
      this.cutPending = null
    }
    if (this.dipLiftTimer !== null) {
      clearTimeout(this.dipLiftTimer)
      this.dipLiftTimer = null
    }
    if (this.dipDark) {
      clearTimeout(this.dipDark.timer)
      const resolve = this.dipDark.resolve
      this.dipDark = null
      resolve(false)
    }
  }

  private fadeOut() {
    if (this._phase === "disposed") return
    if (this._phase === "lit") {
      this._phase = "fadingToDark"
      this.target.style.transition = `opacity ${this.fadeMs}ms ease`
      this.target.style.opacity = "0"
    }
  }

  private tryLift() {
    if (this._phase === "disposed") return
    if (!this.cutPending && !this.dipDark && this.dipLiftTimer === null) {
      this._phase = "lit"
      this.target.style.opacity = "1"
    }
  }
}
