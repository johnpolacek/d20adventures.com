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
// A created hero's arrival in the opening scene. See packages/gm-core/src/character/hero-draft.ts.
const arrivalValidator = v.object({ reason: v.string(), intro: v.string(), tell: v.string() })

export const setHost = mutation({
  args: {
    secret: v.string(),
    adventureId: v.id("adventures"),
    userId: v.string(),
    deviceId: v.id("devices"),
    seats: v.optional(v.array(v.object({ id: v.string(), name: v.string(), key: v.optional(v.string()) }))),
    open: v.optional(v.number()),
    approve: v.optional(v.boolean()),
    pick: v.optional(v.boolean()),
    each: v.optional(v.number()),
    bring: v.optional(v.number()),
    arrivals: v.optional(v.record(v.string(), arrivalValidator)),
  },
  handler: async (ctx, { secret, adventureId, userId, deviceId, seats, open, approve, pick, each, bring, arrivals }) => {
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

const sheetId = (characterId: string) => characterId.split("/").pop()?.replace(".json", "")
// Open seats not yet filled: every guest whose hero is not one the host held sits in an open seat.
const openLeft = (adventure: Doc<"adventures">) => {
  const host = adventure.host
  if (!host?.open) return 0
  const held = new Set((host.seats ?? []).map((s) => s.id))
  return host.open - (adventure.players ?? []).filter((p) => p.userId !== host.userId && !held.has(sheetId(p.characterId) ?? "")).length
}
// The heroes a guest brought to open seats, seated or waiting for the host.
const brought = (adventure: Doc<"adventures">, userId: string) => {
  const held = new Set((adventure.host?.seats ?? []).map((s) => s.id))
  const seated = (adventure.players ?? []).filter((p) => p.userId === userId && !held.has(sheetId(p.characterId) ?? ""))
  const pending = (adventure.host?.requests ?? []).filter((r) => r.userId === userId && r.status === "pending")
  return { seated, pending }
}
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
    if (openLeft(adventure) < 1) throw new Error("This game has no open seat")
    const hero = sheetId(request.characterId)
    if (host.seats?.some((s) => s.id === hero) || adventure.players?.some((p) => sheetId(p.characterId) === hero)) throw new Error("That hero is already at this table")
    const limit = host.bring ?? 1
    const { seated, pending } = brought(adventure, request.userId)
    if (seated.length >= limit) throw new Error(limit === 1 ? "You are already in this game" : `You have brought ${limit} heroes, as many as this table allows`)
    // Their records from before, except heroes still waiting. Past the limit, the latest of those is replaced.
    const replaced = seated.length + pending.length >= limit ? pending[pending.length - 1] : undefined
    const kept = (host.requests ?? []).filter((r) => r.userId !== request.userId || (r.status === "pending" && r !== replaced && sheetId(r.characterId) !== hero))
    // A guest the host removed comes back only with the host's approval.
    if (host.approve || host.removed?.includes(request.userId)) {
      await ctx.db.patch(adventureId, { host: { ...host, requests: [...kept, { ...request, status: "pending" as const, at: Date.now() }] }, updatedAt: Date.now() })
      return { seated: false }
    }
    await ctx.db.patch(adventureId, {
      host: { ...host, requests: kept },
      players: [...(adventure.players ?? []), { userId: request.userId, characterId: request.characterId }],
      playerIds: [...new Set([...adventure.playerIds, request.userId])],
      updatedAt: Date.now(),
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
    if (host.userId !== hostUserId) throw new Error("You are not hosting this adventure")
    const request = host.requests?.find((r) => r.userId === userId && r.status === "pending" && (!characterId || sheetId(r.characterId) === sheetId(characterId)))
    if (!request) throw new Error("That request is no longer waiting")
    const others = (host.requests ?? []).filter((r) => r !== request)
    if (!approve) {
      const rejected = { ...request, status: "rejected" as const, note: note?.trim().slice(0, 300) || undefined }
      await ctx.db.patch(adventureId, { host: { ...host, requests: [...others, rejected] }, updatedAt: Date.now() })
      return null
    }
    // The hero took a seat another way while this request waited.
    if (adventure.players?.some((p) => sheetId(p.characterId) === sheetId(request.characterId))) {
      await ctx.db.patch(adventureId, { host: { ...host, requests: others } })
      return null
    }
    if (openLeft(adventure) < 1) throw new Error("This game has no open seat")
    if (brought(adventure, userId).seated.length >= (host.bring ?? 1)) throw new Error("This guest has brought as many heroes as the table allows")
    await ctx.db.patch(adventureId, {
      host: { ...host, requests: others },
      players: [...(adventure.players ?? []), { userId, characterId: request.characterId }],
      playerIds: [...new Set([...adventure.playerIds, userId])],
      updatedAt: Date.now(),
    })
    return { characterId: request.characterId, hook: request.hook }
  },
})

/** The host removes a seated guest before the game starts, with a note the guest sees. Their seat opens again. */
export const removeGuest = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), hostUserId: v.string(), userId: v.string(), name: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { secret, adventureId, hostUserId, userId, name, note }) => {
    requireServer(secret)
    const { adventure, host } = waiting(await ctx.db.get(adventureId))
    if (host.userId !== hostUserId) throw new Error("You are not hosting this adventure")
    const seated = adventure.players?.find((p) => p.userId === userId)
    if (!seated || userId === host.userId) throw new Error("That guest is not at this table")
    const record = { userId, player: "", characterId: seated.characterId, name, status: "removed" as const, note: note?.trim().slice(0, 300) || undefined, at: Date.now() }
    await ctx.db.patch(adventureId, {
      host: { ...host, removed: [...new Set([...(host.removed ?? []), userId])], requests: [...(host.requests ?? []).filter((r) => r.userId !== userId), record] },
      players: (adventure.players ?? []).filter((p) => p.userId !== userId),
      playerIds: adventure.playerIds.filter((id) => id !== userId),
      updatedAt: Date.now(),
    })
  },
})

/** Where guests choose first, the host takes a held hero nobody chose as the game starts, as their own or an AI hero. */
export const seatHost = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string(), characterId: v.string(), ai: v.optional(v.boolean()) },
  handler: async (ctx, { secret, adventureId, userId, characterId, ai }) => {
    requireServer(secret)
    const { adventure, host } = waiting(await ctx.db.get(adventureId))
    if (host.userId !== userId) throw new Error("You are not hosting this adventure")
    const hero = sheetId(characterId)
    if (adventure.players?.some((p) => p.userId === userId && sheetId(p.characterId) === hero)) return
    if (!host.seats?.some((s) => s.id === hero) || adventure.players?.some((p) => sheetId(p.characterId) === hero)) throw new Error("That hero is not open")
    // The host's own hero leads the party, as at hosting. AI heroes follow.
    const players = adventure.players ?? []
    await ctx.db.patch(adventureId, { players: ai ? [...players, { userId, characterId, controlledBy: "ai" }] : [{ userId, characterId }, ...players], updatedAt: Date.now() })
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
    kind: v.union(v.literal("reply"), v.literal("roll"), v.literal("continue"), v.literal("suggest"), v.literal("skip")),
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
    // One waiting job per character and turn, so a double click is not two actions. Suggested replies are written
    // once per character and turn, so asking again answers with the finished job.
    const pending = await ctx.db
      .query("gmJobs")
      .withIndex("by_adventure", (q) => q.eq("adventureId", job.adventureId))
      .order("desc")
      .take(20)
    const live = (j: Doc<"gmJobs">) => j.status === "queued" || j.status === "running" || (j.kind === "suggest" && j.status === "done")
    const same = pending.find((j) => live(j) && j.turnId === job.turnId && j.kind === job.kind && j.characterId === job.characterId)
    if (same) return same._id
    return await ctx.db.insert("gmJobs", { ...job, status: "queued", createdAt: Date.now() })
  },
})

/** Asks the host's GM for a created hero's arrival before the game starts, unless it is written or on its way. */
export const queueArrival = mutation({
  args: { secret: v.string(), adventureId: v.id("adventures"), userId: v.string(), characterId: v.string(), hook: v.optional(v.string()) },
  handler: async (ctx, { secret, adventureId, userId, characterId, hook }) => {
    requireServer(secret)
    const { host } = waiting(await ctx.db.get(adventureId))
    if (host.arrivals?.[sheetId(characterId) ?? ""]) return
    const jobs = await ctx.db
      .query("gmJobs")
      .withIndex("by_adventure", (q) => q.eq("adventureId", adventureId))
      .order("desc")
      .take(50)
    if (jobs.some((j) => j.kind === "arrival" && j.characterId === characterId && (j.status === "queued" || j.status === "running"))) return
    await ctx.db.insert("gmJobs", { adventureId, kind: "arrival", userId, characterId, ...(hook ? { text: hook } : {}), status: "queued", createdAt: Date.now() })
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
    const queued = await ctx.db
      .query("gmJobs")
      .withIndex("by_adventure_status", (q) => q.eq("adventureId", adventureId).eq("status", "queued"))
      .order("asc")
      .take(20)
    // Players' actions go first, so suggested replies never hold one up in the queue.
    const next = queued.find((j) => j.kind !== "suggest") ?? queued[0]
    if (!next) return null
    await ctx.db.patch(next._id, { status: "running", startedAt: now })
    return { ...next, status: "running" as const, startedAt: now }
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
  },
  handler: async (ctx, { secret, jobId, userId, error, suggestions, arrival }) => {
    requireServer(secret)
    const job = await ctx.db.get(jobId)
    if (!job) throw new Error("Job not found")
    const adventure = await ctx.db.get(job.adventureId)
    if (adventure?.host?.userId !== userId) throw new Error("You are not hosting this adventure")
    if (job.status !== "running") return
    if (job.kind === "arrival" && !error && arrival && adventure.host && !adventure.currentTurnId) {
      const hero = sheetId(job.characterId ?? "") ?? ""
      await ctx.db.patch(adventure._id, { host: { ...adventure.host, arrivals: { ...adventure.host.arrivals, [hero]: arrival } } })
    }
    await ctx.db.patch(jobId, { status: error ? "failed" : "done", error, finishedAt: Date.now(), ...(job.kind === "suggest" && !error && suggestions ? { suggestions } : {}) })
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
