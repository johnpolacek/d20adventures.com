// The pace of a poll loop. It polls at `baseMs` while what it reads keeps changing or work is under way, then slows,
// doubling up to `maxMs` while nothing changes. A hidden page does not poll at all, and showing or focusing it again
// polls at once. `wake()` polls at once too, after a local action that will change what the poll reads.
export class PollPace {
  private quiet = 0
  private waker: (() => void) | null = null

  constructor(
    readonly baseMs: number,
    readonly maxMs: number
  ) {}

  /** The pause after a poll. A busy poll keeps the base pace. Two quiet polls pass at it before the pace slows. */
  next(busy: boolean): number {
    if (busy) {
      this.quiet = 0
      return this.baseMs
    }
    this.quiet++
    return Math.min(this.maxMs, this.baseMs * 2 ** Math.max(0, this.quiet - 2))
  }

  /** Back to the base pace, ending the pause under way. */
  wake() {
    this.quiet = 0
    this.waker?.()
  }

  /** Waits out the pause after a poll. False once `signal` aborts. */
  after(busy: boolean, signal: AbortSignal): Promise<boolean> {
    return this.wait(this.next(busy), signal)
  }

  wait(ms: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false)
    const doc = typeof document === "undefined" ? null : document
    const win = typeof window === "undefined" ? null : window
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const finish = (ok: boolean) => {
        if (timer !== null) clearTimeout(timer)
        doc?.removeEventListener("visibilitychange", onShown)
        win?.removeEventListener("focus", onShown)
        signal.removeEventListener("abort", onAbort)
        if (this.waker === onWake) this.waker = null
        resolve(ok)
      }
      const onAbort = () => finish(false)
      const onWake = () => finish(true)
      const onShown = () => {
        if (doc?.visibilityState === "hidden") return
        this.quiet = 0
        finish(true)
      }
      // A page hidden when the pause ends waits to be shown.
      timer = setTimeout(() => {
        timer = null
        if (doc?.visibilityState !== "hidden") finish(true)
      }, Math.max(0, ms))
      doc?.addEventListener("visibilitychange", onShown)
      win?.addEventListener("focus", onShown)
      signal.addEventListener("abort", onAbort, { once: true })
      this.waker = onWake
    })
  }
}
