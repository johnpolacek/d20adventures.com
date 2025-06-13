import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Minimal mutation: create a new turn
export const createTurn = mutation({
  args: {
    adventureId: v.id("adventures"),
    encounterId: v.string(),
    title: v.string(),
    narrative: v.string(),
    characters: v.array(v.any()),
    order: v.number(),
    isFinalEncounter: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate order
    const existing = await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .filter((q) => q.eq(q.field("order"), args.order))
      .first();
    if (existing) {
      throw new Error(`A turn with order ${args.order} already exists for this adventure.`);
    }
    const now = Date.now();
    return await ctx.db.insert("turns", {
      adventureId: args.adventureId,
      encounterId: args.encounterId,
      title: args.title,
      narrative: args.narrative,
      characters: args.characters,
      order: args.order,
      isFinalEncounter: args.isFinalEncounter,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Minimal mutation: update a turn (patch)
export const updateTurn = mutation({
  args: {
    turnId: v.id("turns"),
    patch: v.object({
      narrative: v.optional(v.string()),
      characters: v.optional(v.array(v.any())),
      updatedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.turnId, args.patch);
    return true;
  },
});

// Minimal mutation: patch adventure
export const patchAdventure = mutation({
  args: {
    adventureId: v.id("adventures"),
    patch: v.object({
      currentTurnId: v.optional(v.id("turns")),
      updatedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.adventureId, args.patch);
    return true;
  },
}); 