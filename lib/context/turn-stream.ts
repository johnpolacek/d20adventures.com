export type TurnStreamState =
  | { kind: "historical" }
  | { kind: "idle" }
  | { kind: "connecting"; attempt: number }
  | { kind: "open" }
  | { kind: "backoff"; attempt: number; delayMs: number }
  | { kind: "exhausted" }

export interface EventSourceLike {
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: string }) => void) | null
  onerror: ((ev: unknown) => void) | null
  close: () => void
}

export interface TurnStreamOptions {
  createEventSource: () => EventSourceLike
  onMessage: (rawData: string) => void
  onStateChange: (state: TurnStreamState) => void
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

/**
 * Explicit SSE lifecycle controller for TurnProvider:
 * - Always closes the active EventSource BEFORE scheduling a backoff retry.
 * - Always cancels any pending backoff timer BEFORE opening a new connection.
 * - Exposes a closed `TurnStreamState` discriminated union.
 */
export class TurnStreamController {
  private _state: TurnStreamState = { kind: "idle" }
  private es: EventSourceLike | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private readonly maxAttempts: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number

  constructor(private readonly opts: TurnStreamOptions) {
    this.maxAttempts = opts.maxAttempts ?? 5
    this.baseDelayMs = opts.baseDelayMs ?? 1000
    this.maxDelayMs = opts.maxDelayMs ?? 30_000
  }

  get state(): TurnStreamState {
    return this._state
  }

  private setState(next: TurnStreamState) {
    this._state = next
    this.opts.onStateChange(next)
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private closeSource() {
    if (this.es) {
      this.es.onopen = null
      this.es.onmessage = null
      this.es.onerror = null
      this.es.close()
      this.es = null
    }
  }

  connect(attempt = 0) {
    if (this.disposed) return
    this.clearTimer()
    this.closeSource()
    this.setState({ kind: "connecting", attempt })

    const es = this.opts.createEventSource()
    this.es = es

    es.onopen = () => {
      if (this.disposed || this.es !== es) return
      this.setState({ kind: "open" })
    }

    es.onmessage = (event) => {
      if (this.disposed || this.es !== es) return
      if (event.data) this.opts.onMessage(event.data)
    }

    es.onerror = () => {
      if (this.disposed || this.es !== es) return
      // Always close before scheduling backoff so browser auto-reconnect never races our timer.
      this.closeSource()
      if (attempt < this.maxAttempts) {
        const delayMs = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs)
        const nextAttempt = attempt + 1
        this.setState({ kind: "backoff", attempt: nextAttempt, delayMs })
        this.timer = setTimeout(() => {
          this.timer = null
          this.connect(nextAttempt)
        }, delayMs)
      } else {
        this.setState({ kind: "exhausted" })
      }
    }
  }

  /** Reconnects when the tab returns to visibility if the stream is not currently open or connecting. */
  onVisible() {
    if (this.disposed) return
    if (this._state.kind === "open" || this._state.kind === "connecting") return
    this.connect(0)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.clearTimer()
    this.closeSource()
    this._state = { kind: "idle" }
  }
}
