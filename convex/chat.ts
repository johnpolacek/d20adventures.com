import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const postMessage = mutation({
  args: {
    adventureId: v.id("adventures"),
    username: v.string(),
    content: v.string(),
    characterName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const content = args.content.slice(0, 4000);
    return await ctx.db.insert("chat_messages", {
      adventureId: args.adventureId,
      username: args.username,
      characterName: args.characterName,
      content,
      createdAt: now,
    });
  },
});

export const getRecent = query({
  args: { adventureId: v.id("adventures"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    const rows = await ctx.db
      .query("chat_messages")
      .withIndex("by_adventure_created", (q) => q.eq("adventureId", args.adventureId))
      .order("desc")
      .take(limit);
    return rows.reverse();
  },
});

export const getSince = query({
  args: { adventureId: v.id("adventures"), since: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chat_messages")
      .withIndex("by_adventure_created", (q) => q.eq("adventureId", args.adventureId))
      .filter((q) => q.gt(q.field("createdAt"), args.since))
      .order("asc")
      .collect();
  },
});


