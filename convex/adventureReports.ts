import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const createAdventureReport = mutation({
  args: {
    adventureId: v.id("adventures"),
    ownerId: v.string(),
    runType: v.union(v.literal("campaign"), v.literal("practice")),
    trigger: v.literal("on_demand"),
    status: v.union(v.literal("ready"), v.literal("failed")),
    report: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert("adventure_reports", {
      ...args,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const getReportsByAdventure = query({
  args: {
    adventureId: v.id("adventures"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
    return await ctx.db
      .query("adventure_reports")
      .withIndex("by_adventure_created", (q) => q.eq("adventureId", args.adventureId))
      .order("desc")
      .take(limit)
  },
})

export const getLatestReportByAdventure = query({
  args: { adventureId: v.id("adventures") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("adventure_reports")
      .withIndex("by_adventure_created", (q) => q.eq("adventureId", args.adventureId))
      .order("desc")
      .first()
  },
})

export const getReportsByOwner = query({
  args: {
    ownerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200)
    return await ctx.db
      .query("adventure_reports")
      .withIndex("by_owner_created", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(limit)
  },
})
