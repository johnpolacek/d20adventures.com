import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

// Convex has no auth config, so every function is public. Store functions only answer
// the Next server, which proves the caller and passes this shared secret.
function requireServer(secret: string) {
  const expected = process.env.STORE_SERVER_SECRET
  if (!expected || secret.length !== expected.length) throw new Error("Forbidden")
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= secret.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) throw new Error("Forbidden")
}

/** Adventure ids the user owns through purchase or grant. */
export const ownedAdventures = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()
    return [...new Set(rows.filter((row) => row.revokedAt === undefined).map((row) => row.adventureId))]
  },
})

/** Idempotent: a repeated Stripe session, or an adventure already owned, returns the existing row. */
export const grantAdventure = mutation({
  args: {
    secret: v.string(),
    userId: v.string(),
    adventureId: v.string(),
    source: v.union(v.literal("purchase"), v.literal("grant")),
    stripeSessionId: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, { secret, ...args }) => {
    requireServer(secret)
    if (args.stripeSessionId) {
      const bySession = await ctx.db
        .query("entitlements")
        .withIndex("by_stripe_session", (q) => q.eq("stripeSessionId", args.stripeSessionId))
        .first()
      if (bySession) return { id: bySession._id, created: false }
    }
    const existing = await ctx.db
      .query("entitlements")
      .withIndex("by_user_adventure", (q) => q.eq("userId", args.userId).eq("adventureId", args.adventureId))
      .collect()
    const active = existing.find((row) => row.revokedAt === undefined)
    if (active) return { id: active._id, created: false }
    const id = await ctx.db.insert("entitlements", { ...args, createdAt: Date.now() })
    return { id, created: true }
  },
})
