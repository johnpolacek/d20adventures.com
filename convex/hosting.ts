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
  args: {
    secret: v.string(),
    adventureId: v.id("adventures"),
    userId: v.string(),
    deviceId: v.id("devices"),
    seats: v.optional(v.array(v.object({ id: v.string(), name: v.string(), key: v.optional(v.string()) }))),
    open: v.optional(v.number()),
  },
  handler: async (ctx, { secret, adventureId, userId, deviceId, seats, open }) => {
    requireServer(secret)
    const adventure = await ctx.db.get(adventureId)
    if (!adventure) throw new Error("Adventure not found")
    if (adventure.ownerId !== userId) throw new Error("Only the adventure's owner can host it")
    await ctx.db.patch(adventureId, { host: { userId, deviceId, seenAt: Date.now(), ...(seats?.length ? { seats } : {}), ...(open ? { open } : {}) }, updatedAt: Date.now() })
  },
})

const sheetId = (characterId: string) => characterId.split("/").pop()?.replace(".json", "")
// Open seats not yet filled: every guest whose hero is not one the host held sits in an open seat.
const openLeft = (adventure: Doc<"adventures">) => {
  const host = adventure.host
  if (!host?.open) return 0
  const held = new Set((host.seats ?? []).map((s) => s.id))
  return host.open - (adventure.players ?? []).filter((p) => p.userId !== host.userId && !held.has(sheetId(p.characterId) ?? "")).length
}
const waiting = (adventure: Doc<"adventures"> | null) => {
  if (!adventure?.host) throw new Error("This adventure is not hosted")
  if (adventure.status !== "waitingForPlayers" || adventure.currentTurnId) throw new Error("This game has already started")
  return { adventure, host: adventure.host }
}

/** A guest asks for an open seat with a hero of their own. Asking again replaces their earlier request. */
export const requestSeat = mutation({
  args: {
    secret: v.string(),
    adventureId: v.id("adventures"),
    userId: v.string(),
    player: v.string(),
    characterId: v.string(),
    name: v.string(),
    race: v.optional(v.string()),
    archetype: v.optional(v.string()),
  },
  handler: async (ctx, { secret, adventureId, ...request }) => {
    requireServer(secret)
    const { adventure, host } = waiting(await ctx.db.get(adventureId))
    if (adventure.playerIds.includes(request.userId)) throw new Error("You are already in this game")
    if (openLeft(adventure) < 1) throw new Error("This game has no open seat")
    const hero = sheetId(request.characterId)
    if (host.seats?.some((s) => s.id === hero) || adventure.players?.some((p) => sheetId(p.characterId) === hero)) throw new Error("That hero is already at this table")
    const others = (host.requests ?? []).filter((r) => r.userId !== request.userId)
    await ctx.db.patch(adventureId, { host: { ...host, requests: [...others, { ...request, status: "pending" as const, at: Date.now() }] }, updatedAt: Date.now() })
  },
})

/** The host approves a guest's request, which seats their hero, or rejects it with a note the guest sees. */
export const answerSeat = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), hostUserId: v.string(), userId: v.string(), approve: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, { secret, adventureId, hostUserId, userId, approve, note }) => {
    requireServer(secret)
    const { adventure, host } = waiting(await ctx.db.get(adventureId))
    if (host.userId !== hostUserId) throw new Error("You are not hosting this adventure")
    const request = host.requests?.find((r) => r.userId === userId && r.status === "pending")
    if (!request) throw new Error("That request is no longer waiting")
    const others = (host.requests ?? []).filter((r) => r.userId !== userId)
    if (!approve) {
      const rejected = { ...request, status: "rejected" as const, note: note?.trim().slice(0, 300) || undefined }
      return ctx.db.patch(adventureId, { host: { ...host, requests: [...others, rejected] }, updatedAt: Date.now() })
    }
    // They took a held seat while this request waited.
    if (adventure.playerIds.includes(userId)) return ctx.db.patch(adventureId, { host: { ...host, requests: others } })
    if (openLeft(adventure) < 1) throw new Error("This game has no open seat")
    await ctx.db.patch(adventureId, {
      host: { ...host, requests: others },
      players: [...(adventure.players ?? []), { userId, characterId: request.characterId }],
      playerIds: [...adventure.playerIds, userId],
      updatedAt: Date.now(),
    })
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
