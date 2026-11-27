import { v } from "convex/values"
import { serverMutation, serverQuery } from "./serverSecret"

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
  paragraphHash: v.optional(v.string()),
})

export const getTurnAudio = serverQuery({
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
export const claimTurnAudioGeneration = serverMutation({
  args: {
    turnId: v.id("turns"),
    adventureId: v.id("adventures"),
    storyHash: v.string(),
    requestedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query("turnAudio")
      .withIndex("by_turn", (q) => q.eq("turnId", args.turnId))
      .unique()

    if (existing && existing.storyHash === args.storyHash) {
      if (existing.status === "ready") {
        return { claimed: false, status: existing.status }
      }
      if (existing.status === "generating" && now - existing.updatedAt < STALE_GENERATION_MS) {
        return { claimed: false, status: existing.status }
      }
      // error, or stale generating: reclaim
    }

    const attempt = (existing?.attempt ?? 0) + 1
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "generating" as const,
        storyHash: args.storyHash,
        attempt,
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
        storyHash: args.storyHash,
        attempt,
        requestedBy: args.requestedBy,
        createdAt: now,
        updatedAt: now,
      })
    }
    return { claimed: true, status: "generating" as const, attempt }
  },
})

export const finalizeTurnAudio = serverMutation({
  args: {
    turnId: v.id("turns"),
    storyHash: v.string(),
    attempt: v.optional(v.number()),
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
    if (!existing || existing.storyHash !== args.storyHash || existing.status !== "generating") return false
    if (args.attempt !== undefined && existing.attempt !== args.attempt) return false
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

export const failTurnAudio = serverMutation({
  args: {
    turnId: v.id("turns"),
    storyHash: v.string(),
    attempt: v.optional(v.number()),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("turnAudio")
      .withIndex("by_turn", (q) => q.eq("turnId", args.turnId))
      .unique()
    if (!existing || existing.storyHash !== args.storyHash || existing.status !== "generating") return false
    if (args.attempt !== undefined && existing.attempt !== args.attempt) return false
    await ctx.db.patch(existing._id, {
      status: "error" as const,
      segments: undefined,
      usage: undefined,
      error: args.error,
      updatedAt: Date.now(),
    })
    return true
  },
})
