import { v } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { storyValidator } from "../story"

export type AdventureStatus = "waitingForPlayers" | "active" | "completed"

export const ALLOWED_ADVENTURE_TRANSITIONS: Record<AdventureStatus, readonly AdventureStatus[]> = {
  waitingForPlayers: ["active"],
  active: ["active", "completed"],
  completed: [],
}

export function assertAdventureTransition(current: AdventureStatus | undefined, next: AdventureStatus): void {
  // Legacy adventures created before status was stored behave as active.
  const from: AdventureStatus = current ?? "active"
  if (from === next && from !== "completed") return
  if (!ALLOWED_ADVENTURE_TRANSITIONS[from].includes(next)) {
    throw new Error(`Invalid adventure status transition: ${from} -> ${next}`)
  }
}

export function assertAdventureActiveForAdvance(adventure: Pick<Doc<"adventures">, "status" | "endedAt">): void {
  if (adventure.status === "completed" || adventure.endedAt !== undefined) {
    throw new Error("This adventure has already ended")
  }
}

export const contentRefValidator = v.object({
  source: v.union(v.literal("published"), v.literal("preview")),
  settingId: v.string(),
  planId: v.string(),
  contentVersion: v.optional(v.string()),
  contentHash: v.optional(v.string()),
  versionId: v.optional(v.string()),
  previewDraftId: v.optional(v.string()),
  schemaVersion: v.string(),
})

export const generatedByValidator = v.object({
  model: v.optional(v.string()),
  promptVersion: v.optional(v.string()),
  contextHash: v.optional(v.string()),
})

export const createTurnArgs = {
  adventureId: v.id("adventures"),
  encounterId: v.string(),
  title: v.string(),
  story: storyValidator,
  characters: v.array(v.any()),
  order: v.number(),
  isFinalEncounter: v.optional(v.boolean()),
  adventurePatch: v.optional(v.any()),
  transition: v.optional(v.any()),
  generatedBy: v.optional(generatedByValidator),
}

export const adventurePatchValidator = v.object({
  currentTurnId: v.optional(v.id("turns")),
  currentEncounterId: v.optional(v.string()),
  contentRef: v.optional(contentRefValidator),
  voiceAssignments: v.optional(v.array(v.object({ characterId: v.string(), voice: v.string() }))),
  adventureSummaryMarkdown: v.optional(v.string()),
  discoveries: v.optional(v.array(v.any())),
  entityUpdates: v.optional(v.array(v.any())),
  openThreads: v.optional(v.array(v.any())),
  resolvedThreadIds: v.optional(v.array(v.string())),
  updatedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  status: v.optional(v.union(v.literal("waitingForPlayers"), v.literal("active"), v.literal("completed"))),
  arrivals: v.optional(v.record(v.string(), v.string())),
})

export async function insertTurn(
  ctx: MutationCtx,
  args: {
    adventureId: Id<"adventures">
    encounterId: string
    title: string
    story: Doc<"turns">["story"]
    characters: Doc<"turns">["characters"]
    order: number
    isFinalEncounter?: boolean
    adventurePatch?: unknown
    transition?: unknown
    generatedBy?: Doc<"turns">["generatedBy"]
  },
  options: { activateAdventure: boolean }
): Promise<Id<"turns">> {
  const adventure = await ctx.db.get(args.adventureId)
  if (!adventure) throw new Error("Adventure not found")
  assertAdventureActiveForAdvance(adventure)

  const existing = await ctx.db
    .query("turns")
    .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
    .filter((q) => q.eq(q.field("order"), args.order))
    .first()
  if (existing) {
    throw new Error(`A turn with order ${args.order} already exists for this adventure.`)
  }

  const now = Date.now()
  const turnId = await ctx.db.insert("turns", {
    adventureId: args.adventureId,
    encounterId: args.encounterId,
    title: args.title,
    story: args.story,
    characters: args.characters,
    order: args.order,
    isFinalEncounter: args.isFinalEncounter,
    adventurePatch: args.adventurePatch,
    transition: args.transition,
    generatedBy: args.generatedBy,
    createdAt: now,
    updatedAt: now,
  })

  if (options.activateAdventure) {
    assertAdventureTransition(adventure.status, "active")
    await ctx.db.patch(args.adventureId, {
      currentTurnId: turnId,
      currentEncounterId: args.encounterId,
      status: "active",
      updatedAt: now,
    })
  }
  return turnId
}

export async function applyAdventurePatch(
  ctx: MutationCtx,
  adventureId: Id<"adventures">,
  patch: Partial<Doc<"adventures">>
): Promise<true> {
  if (patch.status !== undefined) {
    const adventure = await ctx.db.get(adventureId)
    if (!adventure) throw new Error("Adventure not found")
    assertAdventureTransition(adventure.status, patch.status)
  }
  await ctx.db.patch(adventureId, patch)
  return true
}
