// Priority download scheduler for scene files (foreground encounter loads preempt background fill-in
// without busy-polling, and AbortSignal cancels stale encounter batches immediately).

export type FileEntry = { path: string; bytes: number }
export type FilePlan = { need: FileEntry[]; rest: FileEntry[] }
export type FetchResult = { done: string[]; failed: string[] }

// About this much in each request to the runtime, which starts a process for each.
export const BATCH_BYTES = 4e6
// The bar shows only when the files will take longer than this.
export const SHOW_BAR_MS = 3000

export function batchFiles(files: readonly FileEntry[], batchBytes = BATCH_BYTES): FileEntry[][] {
  const out: FileEntry[][] = []
  let current: FileEntry[] = []
  let size = 0
  for (const f of files) {
    current.push(f)
    size += f.bytes
    if (size >= batchBytes) {
      out.push(current)
      current = []
      size = 0
    }
  }
  if (current.length) out.push(current)
  return out
}

export type SchedulerPriority = "foreground" | "background"

type QueuedTask<T> = {
  priority: SchedulerPriority
  signal?: AbortSignal
  run: () => Promise<T>
  resolve: (value: T | undefined) => void
  reject: (reason: unknown) => void
  cleanup?: () => void
}

export type DownloadTransport = {
  plan: (adventureId: string, encounterId?: string) => Promise<FilePlan>
  fetch: (adventureId: string, files: FileEntry[]) => Promise<FetchResult>
}

export class DownloadScheduler {
  private running = false
  private activeForeground = 0
  private foregroundQueue: QueuedTask<unknown>[] = []
  private backgroundQueue: QueuedTask<unknown>[] = []
  private idleWaiters: (() => void)[] = []
  private backgroundRunning = new Set<string>()

  /** Schedules a single download unit. Foreground tasks always preempt background tasks. */
  enqueue<T>(priority: SchedulerPriority, run: () => Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
    if (signal?.aborted) return Promise.resolve(undefined)
    return new Promise<T | undefined>((resolve, reject) => {
      const queue = priority === "foreground" ? this.foregroundQueue : this.backgroundQueue
      const task: QueuedTask<T> = { priority, signal, run, resolve, reject }
      if (signal) {
        const onAbort = () => {
          const idx = queue.indexOf(task as QueuedTask<unknown>)
          if (idx >= 0) {
            queue.splice(idx, 1)
            resolve(undefined)
          }
        }
        signal.addEventListener("abort", onAbort, { once: true })
        task.cleanup = () => signal.removeEventListener("abort", onAbort)
      }
      queue.push(task as QueuedTask<unknown>)
      this.pump()
    })
  }

  /**
   * Downloads all required batches for the active scene in foreground priority.
   * Aborting `signal` (e.g. on encounter switch or unmount) immediately stops further batches
   * and suppresses stale progress/ready callbacks.
   */
  async loadScene(opts: {
    adventureId: string
    encounterId?: string
    signal: AbortSignal
    transport: DownloadTransport
    onProgress: (progress: number | null) => void
    onReady: () => void
    showBarMs?: number
    batchBytes?: number
  }): Promise<boolean> {
    const showBarMs = opts.showBarMs ?? SHOW_BAR_MS
    const started = Date.now()
    this.activeForeground++
    let markTimer: ReturnType<typeof setTimeout> | null = null
    try {
      const plan = await opts.transport.plan(opts.adventureId, opts.encounterId).catch(() => ({ need: [], rest: [] }) as FilePlan)
      if (opts.signal.aborted) return false

      const total = plan.need.reduce((n, f) => n + f.bytes, 0)
      let done = 0
      markTimer = setTimeout(() => {
        if (!opts.signal.aborted) opts.onProgress(total ? done / total : 0)
      }, showBarMs)

      for (const batch of batchFiles(plan.need, opts.batchBytes)) {
        if (opts.signal.aborted) return false
        await this.enqueue("foreground", () => opts.transport.fetch(opts.adventureId, batch), opts.signal)
        if (opts.signal.aborted) return false
        done += batch.reduce((n, f) => n + f.bytes, 0)
        const elapsed = Date.now() - started
        const expected = done > 0 ? (elapsed / done) * total : 0
        opts.onProgress(expected > showBarMs || elapsed > showBarMs ? done / total : null)
      }

      if (opts.signal.aborted) return false
      opts.onReady()
      return true
    } finally {
      if (markTimer !== null) clearTimeout(markTimer)
      this.activeForeground--
      this.notifyIdleWaiters()
      this.pump()
    }
  }

  /**
   * Downloads remaining adventure files in background priority, one batch at a time.
   * Pauses event-driven while any foreground scene load is active (no 250ms busy-poll).
   */
  async fillIn(adventureId: string, transport: DownloadTransport, opts?: { batchBytes?: number }): Promise<void> {
    if (this.backgroundRunning.has(adventureId)) return
    this.backgroundRunning.add(adventureId)
    try {
      for (;;) {
        if (this.activeForeground > 0) {
          await this.waitForForegroundIdle()
          continue
        }
        const plan = await transport.plan(adventureId)
        if (this.activeForeground > 0) continue
        const next = batchFiles(plan.rest, opts?.batchBytes)[0]
        if (!next) return
        const res = await this.enqueue("background", () => transport.fetch(adventureId, next))
        // Nothing came: offline, or the host is down. Try again later, not in a loop.
        if (!res?.done.length) return
      }
    } finally {
      this.backgroundRunning.delete(adventureId)
    }
  }

  private waitForForegroundIdle(): Promise<void> {
    if (this.activeForeground === 0) return Promise.resolve()
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  private notifyIdleWaiters() {
    if (this.activeForeground > 0 || this.idleWaiters.length === 0) return
    const waiters = this.idleWaiters.splice(0)
    for (const resolve of waiters) resolve()
  }

  private nextTask(): QueuedTask<unknown> | undefined {
    while (this.foregroundQueue.length > 0) {
      const task = this.foregroundQueue.shift()!
      task.cleanup?.()
      if (task.signal?.aborted) {
        task.resolve(undefined)
        continue
      }
      return task
    }
    if (this.activeForeground > 0) return undefined
    while (this.backgroundQueue.length > 0) {
      const task = this.backgroundQueue.shift()!
      task.cleanup?.()
      if (task.signal?.aborted) {
        task.resolve(undefined)
        continue
      }
      return task
    }
    return undefined
  }

  private pump() {
    if (this.running) return
    const task = this.nextTask()
    if (!task) return
    this.running = true
    void task
      .run()
      .then(
        (value) => task.resolve(value),
        (err) => task.reject(err)
      )
      .finally(() => {
        this.running = false
        this.pump()
      })
  }
}
