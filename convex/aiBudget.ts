import { v } from "convex/values"
import { mutation, type QueryCtx, query } from "./_generated/server"
import { requireServer } from "./serverSecret"

// The site pays for its own GM's AI calls. Each call adds its cost to the day's row, and the server stops calling once
// the day reaches the limit (lib/gm-server/budget.ts). The limit is the owner's, set on the admin page.

export const DEFAULT_DAILY_USD = 1

async function limit(ctx: QueryCtx) {
  return (await ctx.db.query("aiBudget").first())?.dailyUsd ?? DEFAULT_DAILY_USD
}

/** What a day has cost so far, and the limit. */
export const day = query({
  args: { secret: v.string(), day: v.string() },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const row = await ctx.db
      .query("aiSpend")
      .withIndex("by_day", (q) => q.eq("day", args.day))
      .unique()
    return { usd: row?.usd ?? 0, calls: row?.calls ?? 0, limit: await limit(ctx) }
  },
})

/** Adds one call's cost to its day. */
export const spend = mutation({
  args: { secret: v.string(), day: v.string(), usd: v.number() },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const row = await ctx.db
      .query("aiSpend")
      .withIndex("by_day", (q) => q.eq("day", args.day))
      .unique()
    if (row) await ctx.db.patch(row._id, { usd: row.usd + args.usd, calls: row.calls + 1 })
    else await ctx.db.insert("aiSpend", { day: args.day, usd: args.usd, calls: 1 })
  },
})

/** Sets the daily limit, in US dollars. */
export const setLimit = mutation({
  args: { secret: v.string(), dailyUsd: v.number() },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    if (!(args.dailyUsd >= 0)) throw new Error("The limit must be zero or more.")
    const row = await ctx.db.query("aiBudget").first()
    if (row) await ctx.db.patch(row._id, { dailyUsd: args.dailyUsd, updatedAt: Date.now() })
    else await ctx.db.insert("aiBudget", { dailyUsd: args.dailyUsd, updatedAt: Date.now() })
  },
})
