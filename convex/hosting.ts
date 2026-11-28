import { v } from "convex/values"
import { recordUploadedArt, selectNextJob } from "../packages/gm-core/src/host/jobs"
import {
  answerSeatRequest,
  removeGuestFromTable,
  requestOpenSeat,
  seatHostAtStart,
  sheetId,
} from "../packages/gm-core/src/host/seating"
import type { Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireServer } from "./serverSecret"

// Hosted games: the host's desktop app runs the GM, so guests' actions wait here as jobs until it claims them.
// Every function answers only the Next server, which checks who is asking.

// The host's app is seen at most this often, so polling for work is not a write each time.
const SEEN_EVERY_MS = 30 * 1000
// A created hero's arrival in the opening scene. See packages/gm-core/src/character/hero-draft.ts.
const arrivalValidator = v.object({ reason: v.string(), intro: v.string(), tell: v.string() })
// A generated starting concept (name, background, and optional hook) for Step 1 of hero creation in a hosted lobby.
const heroConceptValidator = v.object({ name: v.string(), gender: v.optional(v.string()), background: v.string(), hook: v.optional(v.string()) })

export const setHost = mutation({
  args: {
    secret: v.string(),
    adventureId: v.id("adventures"),
    userId: v.string(),
    deviceId: v.id("devices"),
    seats: v.optional(v.array(v.object({ id: v.string(), name: v.string(), key: v.optional(v.string()) }))),
    open: v.optional(v.number()),
    flex: v.optional(v.boolean()),
    approve: v.optional(v.boolean()),
    pick: v.optional(v.boolean()),
    each: v.optional(v.number()),
    bring: v.optional(v.number()),
    arrivals: v.optional(v.record(v.string(), arrivalValidator)),
  },
  handler: async (ctx, { secret, adventureId, userId, deviceId, seats, open, flex, approve, pick, each, bring, arrivals }) => {
    requireServer(secret)
    const adventure = await ctx.db.get(adventureId)
    if (!adventure) throw new Error("Adventure not found")
    if (adventure.ownerId !== userId) throw new Error("Only the adventure's owner can host it")
    await ctx.db.patch(adventureId, {
      host: {
        userId,
        deviceId,
        seenAt: Date.now(),
        ...(seats?.length ? { seats } : {}),
        ...(open ? { open } : {}),
        ...(open && flex ? { flex } : {}),
        ...(open && approve ? { approve } : {}),
        ...(pick && seats?.length ? { pick } : {}),
        ...(pick && seats?.length && each ? { each } : {}),
        ...(open && bring && bring > 1 ? { bring: Math.min(bring, open) } : {}),
        ...(arrivals && Object.keys(arrivals).length ? { arrivals } : {}),
      },
      updatedAt: Date.now(),
    })
  },
})

const waiting = (adventure: Doc<"adventures"> | null) => {
  if (!adventure?.host) throw new Error("This adventure is not hosted")
  if (adventure.status !== "waitingForPlayers" || adventure.currentTurnId) throw new Error("This game has already started")
  return { adventure, host: adventure.host }
}

/**
 * A guest takes an open seat with a hero of their own. They are seated at once, unless the host approves heroes: then
 * it waits as a request. A guest fills at most the host's `bring` open seats. Past that, a new request replaces their
 * latest waiting one. Returns whether they were seated.
 */
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
    hook: v.optional(v.string()),
  },
  handler: async (ctx, { secret, adventureId, ...request }) => {
    requireServer(secret)
    const { adventure, host } = waiting(await ctx.db.get(adventureId))
    const now = Date.now()
    const result = requestOpenSeat(adventure, request, now)
    if (!result.ok) throw new Error(result.error)
    if (!result.seated) {
      await ctx.db.patch(adventureId, { host: { ...host, requests: result.requests }, updatedAt: now })
      return { seated: false }
    }
    await ctx.db.patch(adventureId, {
      host: { ...host, requests: result.requests },
      players: [...(adventure.players ?? []), result.addedPlayer],
      playerIds: [...new Set([...adventure.playerIds, request.userId])],
      updatedAt: now,
    })
    return { seated: true }
  },
})

/**
 * The host approves a guest's request, which seats their hero, or rejects it with a note the guest sees. characterId
 * names the hero where the guest asked with several. Returns the seated hero's key and hook.
 */
export const answerSeat = mutation({
  args: {
    secret: v.string(),
    adventureId: v.id("adventures"),
    hostUserId: v.string(),
    userId: v.string(),
    characterId: v.optional(v.string()),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { secret, adventureId, hostUserId, userId, characterId, approve, note }) => {
    requireServer(secret)
    const { adventure, host } = waiting(await ctx.db.get(adventureId))
    const result = answerSeatRequest(adventure, { hostUserId, userId, characterId, approve, note })
    if (!result.ok) throw new Error(result.error)
    if (result.outcome === "rejected") {
      await ctx.db.patch(adventureId, { host: { ...host, requests: result.requests }, updatedAt: Date.now() })
      return null
    }
    if (result.outcome === "already_seated") {
      await ctx.db.patch(adventureId, { host: { ...host, requests: result.requests } })
      return null
    }
    await ctx.db.patch(adventureId, {
      host: { ...host, requests: result.requests },
      players: [...(adventure.players ?? []), result.addedPlayer],
      playerIds: [...new Set([...adventure.playerIds, userId])],
      updatedAt: Date.now(),
    })
    return result.seated
  },
})

/** The host removes a seated guest before the game starts, with a note the guest sees. Their seat opens again. */
export const removeGuest = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), hostUserId: v.string(), userId: v.string(), name: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { secret, adventureId, hostUserId, userId, name, note }) => {
    requireServer(secret)
    const { adventure, host } = waiting(await ctx.db.get(adventureId))
    const now = Date.now()
    const result = removeGuestFromTable(adventure, { hostUserId, userId, name, note }, now)
    if (!result.ok) throw new Error(result.error)
    await ctx.db.patch(adventureId, {
      host: { ...host, removed: result.removed, requests: result.requests },
      players: (adventure.players ?? []).filter((p) => p.userId !== result.removedUserId),
      playerIds: adventure.playerIds.filter((id) => id !== result.removedUserId),
      updatedAt: now,
    })
  },
})

/** Where guests choose first, the host takes a held hero nobody chose as the game starts, as their own or an AI hero. */
export const seatHost = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string(), characterId: v.string(), ai: v.optional(v.boolean()) },
  handler: async (ctx, { secret, adventureId, userId, characterId, ai }) => {
    requireServer(secret)
    const { adventure } = waiting(await ctx.db.get(adventureId))
    const result = seatHostAtStart(adventure, { userId, characterId, ai })
    if (!result.ok) throw new Error(result.error)
    if (!result.changed) return
    await ctx.db.patch(adventureId, { players: result.players, updatedAt: Date.now() })
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
    kind: v.union(v.literal("reply"), v.literal("roll"), v.literal("continue"), v.literal("suggest"), v.literal("skip"), v.literal("react")),
    userId: v.string(),
    characterId: v.optional(v.string()),
    text: v.optional(v.string()),
    result: v.optional(v.number()),
    second: v.optional(v.number()),
    take: v.optional(v.boolean()),
  },
  handler: async (ctx, { secret, ...job }) => {
    requireServer(secret)
    const adventure = await ctx.db.get(job.adventureId)
    if (!adventure?.host) throw new Error("This adventure is not hosted")
    if (adventure.currentTurnId !== job.turnId) throw new Error("This turn has already advanced")
    // One waiting job per character and turn, so a double click is not two actions. Suggested replies are written
    // once per character and turn, so asking again answers with the finished job.
    const [queued, running] = await Promise.all([
      ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", job.adventureId).eq("status", "queued"))
        .collect(),
      ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", job.adventureId).eq("status", "running"))
        .collect(),
    ])
    const active = [...queued, ...running].find((j) => j.turnId === job.turnId && j.kind === job.kind && j.characterId === job.characterId)
    if (active) return active._id
    if (job.kind === "suggest") {
      const done = await ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", job.adventureId).eq("status", "done"))
        .order("desc")
        .take(50)
      const cached = done.find((j) => j.turnId === job.turnId && j.kind === "suggest" && j.characterId === job.characterId)
      if (cached) return cached._id
    }
    return await ctx.db.insert("gmJobs", { ...job, status: "queued", createdAt: Date.now() })
  },
})

/** Asks the host's GM for a created hero's arrival before the game starts, unless it is written or on its way. */
export const queueArrival = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string(), characterId: v.string(), hook: v.optional(v.string()) },
  handler: async (ctx, { secret, adventureId, userId, characterId, hook }) => {
    requireServer(secret)
    const { host } = waiting(await ctx.db.get(adventureId))
    if (host.arrivals?.[sheetId(characterId)]) return
    const [queued, running] = await Promise.all([
      ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "queued"))
        .collect(),
      ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "running"))
        .collect(),
    ])
    if ([...queued, ...running].some((j) => j.kind === "arrival" && j.characterId === characterId)) return
    await ctx.db.insert("gmJobs", { adventureId, kind: "arrival", userId, characterId, ...(hook ? { text: hook } : {}), status: "queued", createdAt: Date.now() })
  },
})

const artValidator = v.object({ front: v.string(), back: v.string(), portrait: v.string() })
const artKindValidator = v.union(v.literal("front"), v.literal("back"), v.literal("portrait"))

/**
 * Asks the host's image CLI to paint a guest's hero, unless it is painted or on its way. Art the hero already has from
 * an earlier game is kept as it is, with no job.
 */
export const queuePaint = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string(), characterId: v.string(), heroId: v.string(), art: v.optional(artValidator) },
  handler: async (ctx, { secret, adventureId, userId, characterId, heroId, art }) => {
    requireServer(secret)
    const adventure = await ctx.db.get(adventureId)
    const host = adventure?.host
    if (!host) throw new Error("This adventure is not hosted")
    if (host.art?.[heroId]) return
    if (art) {
      await ctx.db.patch(adventureId, { host: { ...host, art: { ...host.art, [heroId]: art } } })
      return
    }
    const [queued, running] = await Promise.all([
      ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "queued"))
        .collect(),
      ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "running"))
        .collect(),
    ])
    if ([...queued, ...running].some((j) => j.kind === "paint" && j.characterId === characterId)) return
    await ctx.db.insert("gmJobs", { adventureId, kind: "paint", userId, characterId, status: "queued", createdAt: Date.now() })
  },
})

/** Records that one picture of a running paint job has been uploaded to S3. */
export const recordPaintArt = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), jobId: v.id("gmJobs"), kind: artKindValidator },
  handler: async (ctx, { secret, adventureId, jobId, kind }) => {
    requireServer(secret)
    const job = await ctx.db.get(jobId)
    if (!job || job.adventureId !== adventureId || job.kind !== "paint" || job.status !== "running") {
      throw new Error("That paint job is not running.")
    }
    const uploadedKinds = recordUploadedArt(job.uploadedKinds, kind)
    await ctx.db.patch(jobId, { uploadedKinds })
    return { uploadedKinds }
  },
})

/** A paint job, for the website to check the art the host's app sends for it. */
export const getJob = query({
  args: { secret: v.string(), jobId: v.id("gmJobs") },
  handler: async (ctx, { secret, jobId }) => {
    requireServer(secret)
    return await ctx.db.get(jobId)
  },
})

/**
 * The next job for the host's app, or null while one is still running. Also marks the host as online. A paint takes
 * minutes, so it runs beside other jobs, one paint at a time, and starts only when nothing else is waiting.
 */
export const claimJob = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string() },
  handler: async (ctx, { secret, adventureId, userId }) => {
    requireServer(secret)
    const adventure = await ctx.db.get(adventureId)
    if (!adventure?.host || adventure.host.userId !== userId) throw new Error("You are not hosting this adventure")
    const now = Date.now()
    if (!adventure.host.seenAt || now - adventure.host.seenAt > SEEN_EVERY_MS) await ctx.db.patch(adventureId, { host: { ...adventure.host, seenAt: now } })
    const [running, queued] = await Promise.all([
      ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "running"))
        .take(20),
      ctx.db
        .query("gmJobs")
        .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "queued"))
        .order("asc")
        .take(20),
    ])
    const { abandoned, next } = selectNextJob(running, queued, now)
    for (const job of abandoned) {
      await ctx.db.patch(job._id, { status: "failed", error: "The host's game stopped before finishing this action.", finishedAt: now })
    }
    if (!next) return null
    await ctx.db.patch(next._id, { status: "running", startedAt: now })
    return { ...next, status: "running" as const, startedAt: now }
  },
})

/** Asks the host's GM to generate a starting name and background for a player creating a hero in the lobby. */
export const queueHeroIdea = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string(), text: v.string() },
  handler: async (ctx, { secret, adventureId, userId, text }) => {
    requireServer(secret)
    waiting(await ctx.db.get(adventureId))
    return await ctx.db.insert("gmJobs", { adventureId, kind: "heroIdea", userId, text, status: "queued", createdAt: Date.now() })
  },
})

export const finishJob = mutation({
  args: {
    secret: v.string(),
    jobId: v.id("gmJobs"),
    userId: v.string(),
    error: v.optional(v.string()),
    suggestions: v.optional(v.array(v.object({ label: v.string(), text: v.string() }))),
    // A finished arrival job's arrival, kept for its hero until the game starts.
    arrival: v.optional(arrivalValidator),
    // A finished paint job's art, for the hero it painted.
    art: v.optional(v.object({ heroId: v.string(), paths: artValidator })),
    // A finished heroIdea job's generated name and background.
    heroConcept: v.optional(heroConceptValidator),
  },
  handler: async (ctx, { secret, jobId, userId, error, suggestions, arrival, art, heroConcept }) => {
    requireServer(secret)
    const job = await ctx.db.get(jobId)
    if (!job) throw new Error("Job not found")
    const adventure = await ctx.db.get(job.adventureId)
    if (adventure?.host?.userId !== userId) throw new Error("You are not hosting this adventure")
    if (job.status !== "running") return { finished: false as const, status: job.status }
    if (job.kind === "arrival" && !error && arrival && adventure.host && !adventure.currentTurnId) {
      const hero = sheetId(job.characterId ?? "")
      await ctx.db.patch(adventure._id, { host: { ...adventure.host, arrivals: { ...adventure.host.arrivals, [hero]: arrival } } })
    }
    if (job.kind === "paint" && !error && art && adventure.host) await ctx.db.patch(adventure._id, { host: { ...adventure.host, art: { ...adventure.host.art, [art.heroId]: art.paths } } })
    const status = error ? ("failed" as const) : ("done" as const)
    await ctx.db.patch(jobId, {
      status,
      error,
      finishedAt: Date.now(),
      ...(job.kind === "suggest" && !error && suggestions ? { suggestions } : {}),
      ...(job.kind === "heroIdea" && !error && heroConcept ? { heroConcept } : {}),
    })
    return { finished: true as const, status }
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
      (j): Pick<Doc<"gmJobs">, "_id" | "turnId" | "kind" | "characterId" | "status" | "error" | "suggestions" | "createdAt"> => ({
        _id: j._id,
        turnId: j.turnId,
        kind: j.kind,
        characterId: j.characterId,
        status: j.status,
        error: j.error,
        suggestions: j.suggestions,
        createdAt: j.createdAt,
      })
    )
  },
})
