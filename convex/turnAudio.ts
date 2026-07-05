import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

// A "generating" row older than this is considered abandoned (crashed generation)
// and may be reclaimed by a new request.
const STALE_GENERATION_MS = 5 * 60 * 1000

const segmentValidator = v.object({
  partIndex: v.number(),
  speaker: v.string(),
  characterName: v.optional(v.string()),
  text: v.string(),
  voice: v.string(),
  audioKey: v.string(),
  durationSec: v.number(),
})

export const getTurnAudio = query({
  args: { turnId: v.id("turns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turnAudio")
      .withIndex("by_turn", (q) => q.eq("turnId", args.turnId))
      .unique()
  },
})

// Atomically claim the right to generate audio for a turn. Convex mutations are
// serialized per document, so only one of two concurrent callers wins the claim.
export const claimTurnAudioGeneration = mutation({
  args: {
    turnId: v.id("turns"),
    adventureId: v.id("adventures"),
    narrativeHash: v.string(),
    requestedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query("turnAudio")
      .withIndex("by_turn", (q) => q.eq("turnId", args.turnId))
      .unique()

    if (existing && existing.narrativeHash === args.narrativeHash) {
      if (existing.status === "ready") {
        return { claimed: false, status: existing.status }
      }
      if (existing.status === "generating" && now - existing.updatedAt < STALE_GENERATION_MS) {
        return { claimed: false, status: existing.status }
      }
      // error, or stale generating: reclaim
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "generating" as const,
        narrativeHash: args.narrativeHash,
        requestedBy: args.requestedBy,
        segments: undefined,
        usage: undefined,
        error: undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert("turnAudio", {
        turnId: args.turnId,
        adventureId: args.adventureId,
        status: "generating" as const,
        narrativeHash: args.narrativeHash,
        requestedBy: args.requestedBy,
        createdAt: now,
        updatedAt: now,
      })
    }
    return { claimed: true, status: "generating" as const }
  },
})

export const finalizeTurnAudio = mutation({
  args: {
    turnId: v.id("turns"),
    narrativeHash: v.string(),
    segments: v.array(segmentValidator),
    usage: v.object({
      ttsInputTokens: v.number(),
      ttsOutputTokens: v.number(),
      chargedTokens: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("turnAudio")
      .withIndex("by_turn", (q) => q.eq("turnId", args.turnId))
      .unique()
    if (!existing || existing.narrativeHash !== args.narrativeHash) return false
    await ctx.db.patch(existing._id, {
      status: "ready" as const,
      segments: args.segments,
      usage: args.usage,
      error: undefined,
      updatedAt: Date.now(),
    })
    return true
  },
})

export const failTurnAudio = mutation({
  args: {
    turnId: v.id("turns"),
    narrativeHash: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("turnAudio")
      .withIndex("by_turn", (q) => q.eq("turnId", args.turnId))
      .unique()
    if (!existing || existing.narrativeHash !== args.narrativeHash) return false
    await ctx.db.patch(existing._id, {
      status: "error" as const,
      error: args.error,
      updatedAt: Date.now(),
    })
    return true
  },
})
