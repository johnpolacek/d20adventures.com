// Pure hosted GM job scheduler and paint upload protocol helpers.
// Zero-import and ES2021-safe so both Convex (relative import) and Next/server code (@d20/gm-core/host/jobs)
// share one source of truth.

/** A job the host's app claimed but never finished, because it quit or crashed, is given up after this long. */
export const ABANDONED_MS = 10 * 60 * 1000

/** The three pictures a paint job uploads before the hero's sheet is updated. */
export const ART_KINDS = ["front", "back", "portrait"] as const
export type ArtKind = (typeof ART_KINDS)[number]

export const isArtKind = (value: unknown): value is ArtKind =>
  typeof value === "string" && (ART_KINDS as readonly string[]).includes(value)

/** Appends an uploaded art kind without duplicates. */
export function recordUploadedArt(uploaded: readonly ArtKind[] | null | undefined, kind: ArtKind): ArtKind[] {
  const existing = uploaded ?? []
  return existing.includes(kind) ? [...existing] : [...existing, kind]
}

/** Which art kinds are still missing for a paint job to complete. */
export function missingArtKinds(uploaded: readonly string[] | null | undefined): ArtKind[] {
  return ART_KINDS.filter((kind) => !uploaded?.includes(kind))
}

/** Whether all three art kinds (`front`, `back`, `portrait`) have been uploaded. */
export function hasAllArtKinds(uploaded: readonly string[] | null | undefined): boolean {
  return missingArtKinds(uploaded).length === 0
}

export type GmJobKind = "reply" | "roll" | "continue" | "suggest" | "skip" | "arrival" | "paint" | "react"

export type SchedulableJob = {
  _id: string
  kind: GmJobKind
  createdAt: number
  startedAt?: number
}

/**
 * Pure 3-lane scheduler for hosted GM jobs:
 * - Any running job older than `ABANDONED_MS` is marked abandoned and freed.
 * - At most 1 non-paint job and 1 paint job may run at once.
 * - While a non-paint job is still active, no new job (including paint) is claimed.
 * - Priority among queued jobs (assumed ordered oldest-first):
 *   1. Player/GM actions (`reply`, `roll`, `continue`, `skip`, `arrival`, `react`)
 *   2. Suggested replies (`suggest`)
 *   3. Hero painting (`paint`), only if no paint job is already running.
 */
export function selectNextJob<T extends SchedulableJob>(
  running: readonly T[],
  queued: readonly T[],
  now: number
): { abandoned: T[]; next: T | null } {
  const abandoned: T[] = []
  let paintRunning = false
  let nonPaintRunning = false

  for (const job of running) {
    if (now - (job.startedAt ?? job.createdAt) >= ABANDONED_MS) {
      abandoned.push(job)
    } else if (job.kind === "paint") {
      paintRunning = true
    } else {
      nonPaintRunning = true
    }
  }

  if (nonPaintRunning) return { abandoned, next: null }

  const next =
    queued.find((j) => j.kind !== "suggest" && j.kind !== "paint") ??
    queued.find((j) => j.kind === "suggest") ??
    (paintRunning ? undefined : queued.find((j) => j.kind === "paint")) ??
    null

  return { abandoned, next }
}
