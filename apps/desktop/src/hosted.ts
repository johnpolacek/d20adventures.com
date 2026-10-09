import type { Save } from "../runtime/store"

// Hosted games keep their state on the website. The play view reads them as a save with only the current turn,
// no local dice or walks, and the GM busy while a job for this turn waits or runs.

type Hosted = {
  adventure: Record<string, unknown> & { _id: string; title: string; settingId: string; planId: string; ownerId: string; playerIds: string[]; status?: string }
  turn: (Save["turns"][number] & Record<string, unknown>) | null
  jobs: { _id: string; turnId: string; status: "queued" | "running" | "done" | "failed"; error?: string }[]
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

/** Whether the host's GM has work for the current turn, and the latest failure since its last success. */
export function hostedWork(state: Hosted) {
  const current = state.jobs.filter((j) => j.turnId === state.turn?._id)
  const busy = current.some((j) => j.status === "queued" || j.status === "running")
  // Jobs come newest first. A failure counts until a later job for the turn succeeds.
  const latest = current.find((j) => j.status === "done" || j.status === "failed")
  return { busy, failed: latest?.status === "failed" ? { id: latest._id, error: latest.error ?? "The GM could not finish that action." } : null }
}
