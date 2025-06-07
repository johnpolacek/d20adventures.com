import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const INITIAL_TOKEN_GRANT = 10000; // Example: 10,000 tokens on signup

export const ensureUserTokenRecord = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existingRecord = await ctx.db
      .query("userTokenLedger")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!existingRecord) {
      const now = Date.now();
      // Create the ledger entry
      const ledgerId = await ctx.db.insert("userTokenLedger", {
        userId: args.userId,
        alltimeTokens: INITIAL_TOKEN_GRANT,
        tokensRemaining: INITIAL_TOKEN_GRANT,
        lastTokenUpdate: now,
      });

      // Create the initial transaction history entry
      await ctx.db.insert("tokenTransactionHistory", {
        userId: args.userId,
        type: "initial_grant",
        amount: INITIAL_TOKEN_GRANT, // Positive for a grant
        timestamp: now,
        description: "Initial token grant upon account creation.",
        tokensRemainingAfterTransaction: INITIAL_TOKEN_GRANT,
      });

      return { 
        status: "created", 
        userId: args.userId,
        tokensRemaining: INITIAL_TOKEN_GRANT, 
        alltimeTokens: INITIAL_TOKEN_GRANT,
        ledgerId: ledgerId
      };
    }

    return { 
      status: "exists", 
      userId: args.userId, 
      tokensRemaining: existingRecord.tokensRemaining, 
      alltimeTokens: existingRecord.alltimeTokens ?? 0, // Handle case where it might be undefined due to migration
      ledgerId: existingRecord._id
    };
  },
});

export const decrementTokens = mutation({
  args: {
    userId: v.string(),
    tokensUsed: v.number(),
    transactionType: v.union(
      v.literal("usage_generate_text"),
      v.literal("usage_generate_object"),
      v.literal("usage_image_upload"),
      // Add other usage types as needed
    ),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.tokensUsed <= 0) {
      // No actual cost, or invalid input
      // Optionally log this or return a specific status if needed
      return { success: true, message: "No tokens to decrement or invalid amount.", tokensRemaining: null };
    }

    const userLedger = await ctx.db
      .query("userTokenLedger")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!userLedger) {
      throw new Error(`User token ledger not found for userId: ${args.userId}. Cannot decrement tokens.`);
    }

    if (userLedger.tokensRemaining < args.tokensUsed) {
      // Not enough tokens. Log this attempt if desired.
      // For now, just throw an error. You could also create a transaction history entry for the failed attempt.
      await ctx.db.insert("tokenTransactionHistory", {
        userId: args.userId,
        type: args.transactionType, 
        amount: -args.tokensUsed, // Record the attempted usage as negative
        timestamp: Date.now(),
        description: args.description ? `${args.description} (Failed - Insufficient tokens)` : `Attempted ${args.transactionType} (Failed - Insufficient tokens)`,
        tokensRemainingAfterTransaction: userLedger.tokensRemaining, // Balance before this failed attempt
      });
      throw new Error(
        `Insufficient tokens for userId: ${args.userId}. ` +
        `Required: ${args.tokensUsed}, Available: ${userLedger.tokensRemaining}.`
      );
    }

    const now = Date.now();
    const newTokensRemaining = userLedger.tokensRemaining - args.tokensUsed;

    await ctx.db.patch(userLedger._id, {
      tokensRemaining: newTokensRemaining,
      lastTokenUpdate: now,
    });

    await ctx.db.insert("tokenTransactionHistory", {
      userId: args.userId,
      type: args.transactionType,
      amount: -args.tokensUsed, // Negative for a deduction
      timestamp: now,
      description: args.description,
      tokensRemainingAfterTransaction: newTokensRemaining,
    });

    return { 
      success: true, 
      tokensRemaining: newTokensRemaining, 
      alltimeTokens: userLedger.alltimeTokens ?? 0 
    };
  },
});

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
      .unique();

    if (!userLedger) {
      // This case should ideally be handled by ensureUserTokenRecord being called first.
      // If not, the user effectively has 0 tokens until their record is created.
      return { tokensRemaining: 0, alltimeTokens: 0, needsInitialization: true };
    }

    return {
      tokensRemaining: userLedger.tokensRemaining,
      // Handle case where alltimeTokens might be undefined due to schema migration
      alltimeTokens: userLedger.alltimeTokens ?? 0, 
      needsInitialization: false,
    };
  },
}); 