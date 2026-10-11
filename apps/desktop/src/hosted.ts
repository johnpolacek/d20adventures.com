import { useCallback, useEffect, useRef } from "react"
import type { HostedJob } from "../runtime/host-commands"
import type { Save } from "../runtime/store"

// Hosted games keep their state on the website. The play view reads them as a save with only the current turn,
// no local dice or walks, and the GM busy while a job for this turn waits or runs.

type Hosted = {
  adventure: Record<string, unknown> & { _id: string; title: string; settingId: string; planId: string; ownerId: string; playerIds: string[]; status?: string }
  turn: (Save["turns"][number] & Record<string, unknown>) | null
  jobs: Pick<HostedJob, "_id" | "turnId" | "kind" | "status" | "error" | "suggestions">[]
}

export function hostedSave(state: Hosted): Save | null {
  const { adventure, turn } = state
  if (!turn) return null
  return {
    version: 1,
    provider: "host",
    adventure: {
      ...adventure,
      currentTurnId: turn._id,
      currentEncounterId: turn.encounterId,
      status: adventure.status === "completed" ? "completed" : "active",
      discoveries: (adventure.discoveries as unknown[]) ?? [],
      entityUpdates: (adventure.entityUpdates as unknown[]) ?? [],
      openThreads: (adventure.openThreads as { id: string }[]) ?? [],
      resolvedThreadIds: (adventure.resolvedThreadIds as string[]) ?? [],
      adventureSummaryMarkdown: (adventure.adventureSummaryMarkdown as string) ?? "",
    },
    turns: [turn],
    rolls: {},
    movement: {},
    positions: {},
  }
}

/** Whether the host's GM has an action to resolve for the current turn, and the latest failure since its last success. Suggested replies do not count. */
export function hostedWork(state: Hosted) {
  const current = state.jobs.filter((j) => j.turnId === state.turn?._id && j.kind !== "suggest")
  const busy = current.some((j) => j.status === "queued" || j.status === "running")
  // Jobs come newest first. A failure counts until a later job for the turn succeeds.
  const latest = current.find((j) => j.status === "done" || j.status === "failed")
  return { busy, failed: latest?.status === "failed" ? { id: latest._id, error: latest.error ?? "The GM could not finish that action." } : null }
}

type Suggestions = NonNullable<HostedJob["suggestions"]>
/**
 * Suggested replies in a hosted game: the host's GM writes them as a job. `queue` asks for the job and answers with
 * its id, and the replies come with a later poll of the game. None are offered if the job fails or takes too long.
 */
export function useHostedSuggest(state: Hosted | null, queue: (turnId: string, characterId: string) => Promise<string | undefined>) {
  const waiting = useRef(new Map<string, (list: Suggestions) => void>())
  const queueRef = useRef(queue)
  queueRef.current = queue
  useEffect(() => {
    for (const job of state?.jobs ?? []) if (job.status === "done" || job.status === "failed") waiting.current.get(job._id)?.(job.suggestions ?? [])
  }, [state])
  return useCallback(async (turnId: string, characterId: string) => {
    const jobId = await queueRef.current(turnId, characterId)
    if (!jobId) return []
    return new Promise<Suggestions>((resolve) => {
      const done = (list: Suggestions) => {
        clearTimeout(timer)
        waiting.current.delete(jobId)
        resolve(list)
      }
      const timer = setTimeout(() => done([]), 60_000)
      waiting.current.set(jobId, done)
    })
  }, [])
}
