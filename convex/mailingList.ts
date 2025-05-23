import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

// Types
export type MailingListSubscription = Doc<"mailing_list_subscriptions">;

// Queries
export const getSubscriptions = query({
  handler: async (ctx) => {
    try {
      return await ctx.db
        .query("mailing_list_subscriptions")
        .order("desc")
        .collect();
    } catch (error) {
      console.error("Error getting subscriptions:", error);
      throw error;
    }
  },
});

export const getSubscriptionByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db
        .query("mailing_list_subscriptions")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();
    } catch (error) {
      console.error("Error getting subscription by email:", error);
      throw error;
    }
  },
});

// Mutations
export const subscribe = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    preferences: v.optional(v.object({
      marketing: v.boolean(),
      updates: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    try {
      // Check if email already exists
      const existing = await ctx.db
        .query("mailing_list_subscriptions")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();

      if (existing) {
        // If already subscribed, perhaps update their info or just return existing?
        // For a waitlist, re-subscribing might just confirm their interest.
        // Or, if they were unsubscribed, re-subscribe them.
        // For now, throwing error if active. If unsubscribed, allow re-subscribe.
        if (!existing.unsubscribedAt) {
          throw new Error("Email already subscribed");
        }
        // If they are re-subscribing after being unsubscribed:
        const now = Date.now();
        return await ctx.db.patch(existing._id, {
            name: args.name,
            preferences: args.preferences ?? { marketing: false, updates: false },
            unsubscribedAt: null, // Re-subscribe
            updatedAt: now,
            // Note: subscribedAt and createdAt remain from original subscription
        });
      }

      const now = Date.now();
      const subscription = {
        userId: args.userId,
        email: args.email,
        name: args.name,
        preferences: args.preferences ?? { marketing: false, updates: false }, // Default if not provided
        subscribedAt: now,
        unsubscribedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const id = await ctx.db.insert("mailing_list_subscriptions", subscription);
      return await ctx.db.get(id);
    } catch (error) {
      console.error("Error subscribing:", error);
      throw error;
    }
  },
});

export const unsubscribe = mutation({
  args: { 
    email: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      console.log('[unsubscribe] Attempting to unsubscribe email:', args.email);
      const subscription = await ctx.db
        .query("mailing_list_subscriptions")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();
      console.log('[unsubscribe] Subscription found:', subscription);
      if (!subscription) {
        throw new Error("Subscription not found");
      }
      const now = Date.now();
      await ctx.db.patch(subscription._id, {
        unsubscribedAt: now,
        updatedAt: now,
      });
      return true;
    } catch (error) {
      console.error("Error unsubscribing:", error);
      throw error;
    }
  },
});

export const deleteSubscription = mutation({
  args: { id: v.id("mailing_list_subscriptions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
}); 