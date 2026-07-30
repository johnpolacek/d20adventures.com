import { v } from "convex/values"
import { mutation, query, type MutationCtx } from "./_generated/server"

const INITIAL_TOKEN_GRANT = 1000

// Shared by ensureUserTokenRecord and splitDecrementTokens (mutations can't
// call other mutations).
async function ensureLedger(ctx: MutationCtx, userId: string) {
  const existingRecord = await ctx.db
    .query("userTokenLedger")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()

  if (existingRecord) {
    return {
      status: "exists" as const,
      userId,
      tokensRemaining: existingRecord.tokensRemaining,
      alltimeTokens: existingRecord.alltimeTokens ?? 0, // Handle case where it might be undefined due to migration
      ledgerId: existingRecord._id,
    }
  }

  const now = Date.now()
  const ledgerId = await ctx.db.insert("userTokenLedger", {
    userId,
    alltimeTokens: INITIAL_TOKEN_GRANT,
    tokensRemaining: INITIAL_TOKEN_GRANT,
    lastTokenUpdate: now,
  })

  await ctx.db.insert("tokenTransactionHistory", {
    userId,
    type: "initial_grant",
    amount: INITIAL_TOKEN_GRANT,
    timestamp: now,
    tokensRemainingAfterTransaction: INITIAL_TOKEN_GRANT,
  })

  return {
    status: "created" as const,
    userId,
    tokensRemaining: INITIAL_TOKEN_GRANT,
    alltimeTokens: INITIAL_TOKEN_GRANT,
    ledgerId,
  }
}

export const ensureUserTokenRecord = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ensureLedger(ctx, args.userId)
  },
})

export const decrementTokens = mutation({
  args: {
    userId: v.string(),
    tokensUsed: v.number(),
    transactionType: v.union(
      v.literal("usage_generate_text"),
      v.literal("usage_generate_object"),
      v.literal("usage_image_upload"),
      v.literal("usage_join_adventure"),
      v.literal("usage_encounter_asset"),
      v.literal("usage_tts_audio")
    ),
  },
  handler: async (ctx, args) => {
    if (args.tokensUsed <= 0) {
      // No actual cost, or invalid input
      // Optionally log this or return a specific status if needed
      return { success: true, message: "No tokens to decrement or invalid amount.", tokensRemaining: null }
    }

    const userLedger = await ctx.db
      .query("userTokenLedger")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique()

    if (!userLedger) {
      throw new Error(`User token ledger not found for userId: ${args.userId}. Cannot decrement tokens.`)
    }

    if (userLedger.tokensRemaining < args.tokensUsed) {
      throw new Error(`Insufficient tokens for userId: ${args.userId}. ` + `Required: ${args.tokensUsed}, Available: ${userLedger.tokensRemaining}.`)
    }

    const now = Date.now()
    const newTokensRemaining = userLedger.tokensRemaining - args.tokensUsed

    await ctx.db.patch(userLedger._id, {
      tokensRemaining: newTokensRemaining,
      lastTokenUpdate: now,
    })

    await ctx.db.insert("tokenTransactionHistory", {
      userId: args.userId,
      type: args.transactionType,
      amount: -args.tokensUsed,
      timestamp: now,
      tokensRemainingAfterTransaction: newTokensRemaining,
    })

    return {
      success: true,
      tokensRemaining: newTokensRemaining,
      alltimeTokens: userLedger.alltimeTokens ?? 0,
    }
  },
})

export const incrementTokens = mutation({
  args: {
    userId: v.string(),
    tokensToCredit: v.number(),
    transactionType: v.union(v.literal("purchase"), v.literal("adjustment_refund"), v.literal("adjustment_manual")),
  },
  handler: async (ctx, args) => {
    if (args.tokensToCredit <= 0) {
      return { success: true, message: "No tokens to credit or invalid amount.", tokensRemaining: null }
    }

    const userLedger = await ctx.db
      .query("userTokenLedger")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique()

    if (!userLedger) {
      throw new Error(`User token ledger not found for userId: ${args.userId}. Cannot credit tokens.`)
    }

    const now = Date.now()
    const newTokensRemaining = userLedger.tokensRemaining + args.tokensToCredit

    await ctx.db.patch(userLedger._id, {
      tokensRemaining: newTokensRemaining,
      lastTokenUpdate: now,
    })

    await ctx.db.insert("tokenTransactionHistory", {
      userId: args.userId,
      type: args.transactionType,
      amount: args.tokensToCredit,
      timestamp: now,
      tokensRemainingAfterTransaction: newTokensRemaining,
    })

    return {
      success: true,
      tokensRemaining: newTokensRemaining,
      alltimeTokens: userLedger.alltimeTokens ?? 0,
    }
  },
})

export const getTokenBalance = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // It's generally better for the calling server action to call ensureUserTokenRecord first.
    // However, if we want this query to be self-sufficient in ensuring a record exists:
    // await ctx.runMutation(api.userTokenManagement.ensureUserTokenRecord, { userId: args.userId });
    // For now, we'll assume ensureUserTokenRecord is called by the server action before this query.

    const userLedger = await ctx.db
      .query("userTokenLedger")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique()

    if (!userLedger) {
      // This case should ideally be handled by ensureUserTokenRecord being called first.
      // If not, the user effectively has 0 tokens until their record is created.
      return { tokensRemaining: 0, alltimeTokens: 0, needsInitialization: true }
    }

    return {
      tokensRemaining: userLedger.tokensRemaining,
      // Handle case where alltimeTokens might be undefined due to schema migration
      alltimeTokens: userLedger.alltimeTokens ?? 0,
      needsInitialization: false,
    }
  },
})

// Even per-member share, rounded to 6 decimals (the ledger already stores
// fractional tokens from the 0.01 provider-token multiplier).
function computeShare(totalTokens: number, memberCount: number): number {
  return Number((totalTokens / memberCount).toFixed(6))
}

// Read-only pre-check for a split charge: can every member cover their share?
// splitDecrementTokens creates missing ledgers with the initial grant, so a
// user without a ledger row counts the grant as available here.
export const checkSplitBalances = query({
  args: { userIds: v.array(v.string()), totalTokens: v.number() },
  handler: async (ctx, args) => {
    const userIds = [...new Set(args.userIds)]
    if (userIds.length === 0 || args.totalTokens <= 0) {
      return { ok: true, share: 0, members: [] }
    }
    const share = computeShare(args.totalTokens, userIds.length)

    const members = await Promise.all(
      userIds.map(async (userId) => {
        const ledger = await ctx.db
          .query("userTokenLedger")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .unique()
        // No ledger row means the initial grant hasn't been claimed yet; the
        // grant exceeds any realistic share, so count it as available.
        const available = ledger ? ledger.tokensRemaining : INITIAL_TOKEN_GRANT
        return { userId, available, short: available < share, needsInitialization: !ledger }
      })
    )

    return { ok: members.every((m) => !m.short), share, members }
  },
})

// Charge an even share of totalTokens to each user. All-or-nothing unless
// clampToBalance is set: with it, members short on balance pay what they have
// (used for post-generation actuals so a mid-flight spend elsewhere can't
// block publishing the manifest). Convex mutations are transactional, so the
// no-charge failure path is atomic.
export const splitDecrementTokens = mutation({
  args: {
    userIds: v.array(v.string()),
    totalTokens: v.number(),
    transactionType: v.literal("usage_tts_audio"),
    description: v.optional(v.string()),
    clampToBalance: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userIds = [...new Set(args.userIds)]
    if (userIds.length === 0 || args.totalTokens <= 0) {
      return { success: true as const, share: 0, results: [] }
    }
    const share = computeShare(args.totalTokens, userIds.length)

    const ledgers = []
    for (const userId of userIds) {
      const record = await ensureLedger(ctx, userId)
      ledgers.push({ userId, ledgerId: record.ledgerId, tokensRemaining: record.tokensRemaining, alltimeTokens: record.alltimeTokens })
    }

    if (!args.clampToBalance) {
      const shortUserIds = ledgers.filter((l) => l.tokensRemaining < share).map((l) => l.userId)
      if (shortUserIds.length > 0) {
        return { success: false as const, share, shortUserIds }
      }
    }

    const now = Date.now()
    const results = []
    for (const ledger of ledgers) {
      const charged = args.clampToBalance ? Math.min(share, Math.max(ledger.tokensRemaining, 0)) : share
      const newTokensRemaining = ledger.tokensRemaining - charged
      if (charged > 0) {
        await ctx.db.patch(ledger.ledgerId, {
          tokensRemaining: newTokensRemaining,
          lastTokenUpdate: now,
        })
        await ctx.db.insert("tokenTransactionHistory", {
          userId: ledger.userId,
          type: args.transactionType,
          amount: -charged,
          timestamp: now,
          tokensRemainingAfterTransaction: newTokensRemaining,
          description: args.description,
        })
      }
      results.push({ userId: ledger.userId, charged, tokensRemaining: newTokensRemaining })
    }

    return { success: true as const, share, results }
  },
})
