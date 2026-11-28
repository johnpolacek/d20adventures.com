import type { Page } from "./pages"
import { PollPace } from "./poll-pace"

// Explicit state machines for DesktopGame (apps/desktop/src/play.tsx):
// 1. AppRoute: single discriminated union (booting | gate | menu | setup | local_play | hosted)
// 2. CommandQueue: serialized local command queue with explicit phase (idle | shown | writing | quiet)
// 3. HostedPollController: sequential AbortController-backed host poll loop that never overlaps
//    and never lets a stale poll overwrite a fresher act()/say() mutation.

export type MenuPage = "home" | Page

export type UserRoute =
  | { kind: "menu"; page: MenuPage }
  | { kind: "setup" }
  | { kind: "local_play" }
  | { kind: "hosted"; adventureId: string }

export type AppRoute =
  | { kind: "booting" }
  | { kind: "gate" }
  | UserRoute

/** Resolves the effective route given account/boot status. `gated` always preempts hosted/play routes. */
export function resolveAppRoute(
  userRoute: UserRoute,
  status: { accountReady: boolean; gated: boolean; loaded: boolean }
): AppRoute {
  if (status.gated) return { kind: "gate" }
  if (!status.accountReady || !status.loaded) return { kind: "booting" }
  return userRoute
}

/** Escape key route transition: setup -> adventures, menu page -> home, home (with save) -> local_play. */
export function escapeUserRoute(route: AppRoute, hasSave: boolean): UserRoute | null {
  switch (route.kind) {
    case "setup":
      return { kind: "menu", page: "adventures" }
    case "menu":
      if (route.page !== "home") return { kind: "menu", page: "home" }
      return hasSave ? { kind: "local_play" } : null
    case "booting":
    case "gate":
    case "local_play":
    case "hosted":
      return null
  }
}

export type CommandMode = "shown" | "writing" | "quiet"
export type CommandPhase = "idle" | CommandMode

export type CommandQueueState = {
  phase: CommandPhase
  shown: boolean
  writing: boolean
}

/**
 * Serialized command runner for local game/hero commands.
 * - One command runs at a time in FIFO order.
 * - A `"shown"` command requested while another `"shown"` command is queued or running is dropped (returns `undefined`).
 * - `"writing"` and `"quiet"` commands queue without blocking user-visible `"shown"` state until they execute.
 */
export class CommandQueue {
  private chain: Promise<unknown> = Promise.resolve()
  private activeMode: CommandMode | null = null
  private shownQueued = false
  private stateValue: CommandQueueState = { phase: "idle", shown: false, writing: false }

  constructor(private readonly onChange?: (state: CommandQueueState) => void) {}

  get state(): CommandQueueState {
    return this.stateValue
  }

  run<T>(mode: CommandMode, work: () => Promise<T>): Promise<T | undefined> {
    if (mode === "shown") {
      if (this.shownQueued) return Promise.resolve(undefined)
      this.shownQueued = true
      this.sync()
    }
    const previous = this.chain
    let release!: () => void
    this.chain = new Promise<void>((resolve) => {
      release = resolve
    })
    return (async () => {
      await previous
      this.activeMode = mode
      this.sync()
      try {
        return await work()
      } finally {
        this.activeMode = null
        if (mode === "shown") this.shownQueued = false
        this.sync()
        release()
      }
    })()
  }

  private sync() {
    const shown = this.shownQueued
    const writing = this.activeMode === "writing"
    const phase: CommandPhase = shown ? "shown" : (this.activeMode ?? "idle")
    const prev = this.stateValue
    if (prev.phase === phase && prev.shown === shown && prev.writing === writing) return
    this.stateValue = { phase, shown, writing }
    this.onChange?.(this.stateValue)
  }
}

export type HostedPollResult<S, W> = {
  state?: S | null
  error?: string
  worker: W | null
}

/**
 * Sequential AbortController-backed poll loop for hosted games.
 * - Never overlaps two poll requests: waits `intervalMs` AFTER each poll resolves.
 * - Slows toward `maxIntervalMs` while the state stays the same and `busy` is false, pauses while the page is
 *   hidden, and polls at once after a mutation.
 * - Tracks a monotonic mutation epoch so any poll started before an `act()`/`say()` mutation
 *   discards its stale state rather than clobbering the mutation's fresher response.
 */
export class HostedPollController<S, W> {
  private abort: AbortController | null = null
  private epoch = 0
  private activeAdventureId: string | null = null
  private pace: PollPace | null = null

  get active(): string | null {
    return this.activeAdventureId
  }

  /** Marks a local mutation (`act` / `say`) so any already-in-flight poll won't overwrite its state. */
  beginMutation(): number {
    this.pace?.wake()
    return ++this.epoch
  }

  /** Starts polling `adventureId` sequentially. Stops any previous poll loop first. */
  start(
    adventureId: string,
    opts: {
      intervalMs?: number
      maxIntervalMs?: number
      /** Work under way that keeps the base pace, as a GM job the poll waits on. */
      busy?: (state: S) => boolean
      poll: (adventureId: string, signal: AbortSignal) => Promise<HostedPollResult<S, W>>
      onState: (state: S) => void
      onWorker: (worker: W | null) => void
      onError: (error: string) => void
    }
  ) {
    this.stop()
    const controller = new AbortController()
    this.abort = controller
    this.activeAdventureId = adventureId
    const intervalMs = opts.intervalMs ?? 1500
    const pace = new PollPace(intervalMs, opts.maxIntervalMs ?? intervalMs)
    this.pace = pace
    const signal = controller.signal

    void (async () => {
      let last = ""
      while (!signal.aborted) {
        const startedEpoch = this.epoch
        let busy = true
        try {
          const result = await opts.poll(adventureId, signal)
          if (signal.aborted) return
          // Only apply polled state when no mutation superseded this poll while it was in flight.
          if (result.state) {
            const seen = JSON.stringify(result.state)
            busy = seen !== last || Boolean(opts.busy?.(result.state))
            last = seen
          }
          if (startedEpoch === this.epoch) {
            if (result.state) opts.onState(result.state)
            if (result.error) opts.onError(result.error)
          }
          opts.onWorker(result.worker)
        } catch (error) {
          if (signal.aborted) return
          if (startedEpoch === this.epoch) opts.onError(String(error))
        }
        const ok = await pace.after(busy, signal)
        if (!ok) return
      }
    })()
  }

  stop() {
    this.abort?.abort()
    this.abort = null
    this.pace = null
    this.activeAdventureId = null
  }
}
