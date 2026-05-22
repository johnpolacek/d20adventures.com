import { v } from "convex/values"
import { mutation } from "./_generated/server"

const contentRefValidator = v.object({
  source: v.union(v.literal("published"), v.literal("preview")),
  settingId: v.string(),
  planId: v.string(),
  contentVersion: v.optional(v.string()),
  contentHash: v.optional(v.string()),
  versionId: v.optional(v.string()),
  previewDraftId: v.optional(v.string()),
  schemaVersion: v.string(),
})

const generatedByValidator = v.object({
  model: v.optional(v.string()),
  promptVersion: v.optional(v.string()),
  contextHash: v.optional(v.string()),
})

// Minimal mutation: create a new turn
export const createTurn = mutation({
  args: {
    adventureId: v.id("adventures"),
    encounterId: v.string(),
    title: v.string(),
    narrative: v.string(),
    characters: v.array(v.any()),
    order: v.number(),
    isFinalEncounter: v.optional(v.boolean()),
    adventurePatch: v.optional(v.any()),
    transition: v.optional(v.any()),
    generatedBy: v.optional(generatedByValidator),
  },
  handler: async (ctx, args) => {
    // Check for duplicate order
    const existing = await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .filter((q) => q.eq(q.field("order"), args.order))
      .first()
    if (existing) {
      throw new Error(`A turn with order ${args.order} already exists for this adventure.`)
    }
    const now = Date.now()
    return await ctx.db.insert("turns", {
      adventureId: args.adventureId,
      encounterId: args.encounterId,
      title: args.title,
      narrative: args.narrative,
      characters: args.characters,
      order: args.order,
      isFinalEncounter: args.isFinalEncounter,
      adventurePatch: args.adventurePatch,
      transition: args.transition,
      generatedBy: args.generatedBy,
      createdAt: now,
      updatedAt: now,
    })
  },
})

// Minimal mutation: update a turn (patch)
export const updateTurn = mutation({
  args: {
    turnId: v.id("turns"),
    patch: v.object({
      narrative: v.optional(v.string()),
      characters: v.optional(v.array(v.any())),
      updatedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.turnId, args.patch)
    return true
  },
})

// Minimal mutation: patch adventure
export const patchAdventure = mutation({
  args: {
    adventureId: v.id("adventures"),
    patch: v.object({
      currentTurnId: v.optional(v.id("turns")),
      currentEncounterId: v.optional(v.string()),
      contentRef: v.optional(contentRefValidator),
      adventureSummaryMarkdown: v.optional(v.string()),
      discoveries: v.optional(v.array(v.any())),
      entityUpdates: v.optional(v.array(v.any())),
      openThreads: v.optional(v.array(v.any())),
      resolvedThreadIds: v.optional(v.array(v.string())),
      updatedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      status: v.optional(v.union(v.literal("waitingForPlayers"), v.literal("active"), v.literal("completed"))),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.adventureId, args.patch)
    return true
  },
})
