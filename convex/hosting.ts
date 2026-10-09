import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireServer } from "./serverSecret"

// Hosted games: the host's desktop app runs the GM, so guests' actions wait here as jobs until it claims them.
// Every function answers only the Next server, which checks who is asking.

// A job the host's app claimed but never finished, because it quit or crashed, is given up after this long.
const ABANDONED_MS = 10 * 60 * 1000
// The host's app is seen at most this often, so polling for work is not a write each time.
const SEEN_EVERY_MS = 30 * 1000

export const setHost = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string(), deviceId: v.id("devices") },
  handler: async (ctx, { secret, adventureId, userId, deviceId }) => {
    requireServer(secret)
    const adventure = await ctx.db.get(adventureId)
    if (!adventure) throw new Error("Adventure not found")
    if (adventure.ownerId !== userId) throw new Error("Only the adventure's owner can host it")
    await ctx.db.patch(adventureId, { host: { userId, deviceId, seenAt: Date.now() }, updatedAt: Date.now() })
  },
})

/** Games this account hosts, newest first. */
export const hostedBy = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    requireServer(secret)
    const owned = await ctx.db
      .query("adventures")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(100)
    return owned.filter((a) => a.host?.userId === userId)
  },
})

export const queueJob = mutation({
  args: {
    secret: v.string(),
    adventureId: v.id("adventures"),
    turnId: v.id("turns"),
    kind: v.union(v.literal("reply"), v.literal("roll"), v.literal("continue")),
    userId: v.string(),
    characterId: v.optional(v.string()),
    text: v.optional(v.string()),
    result: v.optional(v.number()),
    movement: v.optional(v.any()),
  },
  handler: async (ctx, { secret, ...job }) => {
    requireServer(secret)
    const adventure = await ctx.db.get(job.adventureId)
    if (!adventure?.host) throw new Error("This adventure is not hosted")
    if (adventure.currentTurnId !== job.turnId) throw new Error("This turn has already advanced")
    // One waiting job per character and turn, so a double click is not two actions.
    const pending = await ctx.db
      .query("gmJobs")
      .withIndex("by_adventure", (q) => q.eq("adventureId", job.adventureId))
      .order("desc")
      .take(20)
    const same = pending.find((j) => (j.status === "queued" || j.status === "running") && j.turnId === job.turnId && j.kind === job.kind && j.characterId === job.characterId)
    if (same) return same._id
    return await ctx.db.insert("gmJobs", { ...job, status: "queued", createdAt: Date.now() })
  },
})

/** The next job for the host's app, or null while one is still running. Also marks the host as online. */
export const claimJob = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string() },
  handler: async (ctx, { secret, adventureId, userId }) => {
    requireServer(secret)
    const adventure = await ctx.db.get(adventureId)
    if (!adventure?.host || adventure.host.userId !== userId) throw new Error("You are not hosting this adventure")
    const now = Date.now()
    if (!adventure.host.seenAt || now - adventure.host.seenAt > SEEN_EVERY_MS) await ctx.db.patch(adventureId, { host: { ...adventure.host, seenAt: now } })
    const running = await ctx.db
      .query("gmJobs")
      .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "running"))
      .first()
    if (running) {
      if (now - (running.startedAt ?? running.createdAt) < ABANDONED_MS) return null
      await ctx.db.patch(running._id, { status: "failed", error: "The host's game stopped before finishing this action.", finishedAt: now })
    }
    const next = await ctx.db
      .query("gmJobs")
      .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "queued"))
      .order("asc")
      .first()
    if (!next) return null
    await ctx.db.patch(next._id, { status: "running", startedAt: now })
    return { ...next, status: "running" as const, startedAt: now }
  },
})

export const finishJob = mutation({
  args: { secret: v.string(), jobId: v.id("gmJobs"), userId: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, { secret, jobId, userId, error }) => {
    requireServer(secret)
    const job = await ctx.db.get(jobId)
    if (!job) throw new Error("Job not found")
    const adventure = await ctx.db.get(job.adventureId)
    if (adventure?.host?.userId !== userId) throw new Error("You are not hosting this adventure")
    if (job.status !== "running") return
    await ctx.db.patch(jobId, { status: error ? "failed" : "done", error, finishedAt: Date.now() })
  },
})

/** The latest jobs for an adventure, so players can see what the host's GM is working on or why it failed. */
export const recentJobs = query({
  args: { secret: v.string(), adventureId: v.id("adventures") },
  handler: async (ctx, { secret, adventureId }) => {
    requireServer(secret)
    const jobs = await ctx.db
      .query("gmJobs")
      .withIndex("by_adventure", (q) => q.eq("adventureId", adventureId))
      .order("desc")
      .take(10)
    return jobs.map(
      (j): Pick<Doc<"gmJobs">, "_id" | "turnId" | "kind" | "characterId" | "status" | "error" | "createdAt"> => ({
        _id: j._id,
        turnId: j.turnId,
        kind: j.kind,
        characterId: j.characterId,
        status: j.status,
        error: j.error,
        createdAt: j.createdAt,
      })
    )
  },
})
