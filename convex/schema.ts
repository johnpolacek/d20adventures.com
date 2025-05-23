import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Define your schema
export default defineSchema({
  visits: defineTable({
    path: v.string(),
    userId: v.union(v.string(), v.null()),
    metadata: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_path", ["path"])
    .index("by_created", ["createdAt"]),

  mailing_list_subscriptions: defineTable({
    userId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    preferences: v.object({
      marketing: v.boolean(),
      updates: v.boolean(),
    }),
    subscribedAt: v.number(),
    unsubscribedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"])
    .index("by_user", ["userId"])
    .index("by_subscribed", ["subscribedAt"]),

  // Multiplayer Adventure Tables
  adventures: defineTable({
    planId: v.string(),
    settingId: v.string(),
    ownerId: v.string(),
    playerIds: v.array(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    currentTurnId: v.optional(v.id("turns")),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_player", ["playerIds"])
    .index("by_started", ["startedAt"]),

  turns: defineTable({
    adventureId: v.id("adventures"),
    encounterId: v.string(),
    title: v.string(),
    narrative: v.string(),
    characters: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        type: v.string(), // "pc" | "npc"
        userId: v.optional(v.string()),
        initiative: v.number(),
        isComplete: v.boolean(),
        hasReplied: v.boolean(),
        rollRequired: v.optional(v.any()),
        rollResult: v.optional(v.number()),
        healthPercent: v.optional(v.number()),
        image: v.optional(v.string()),
        gender: v.optional(v.string()),
        race: v.optional(v.string()),
        archetype: v.optional(v.string()),
        // Added fields for AI/gameplay context
        appearance: v.optional(v.string()),
        background: v.optional(v.string()),
        behavior: v.optional(v.string()),
        motivation: v.optional(v.string()),
        personality: v.optional(v.string()),
        skills: v.optional(v.array(v.string())),
        equipment: v.optional(v.array(v.object({
          name: v.string(),
          description: v.optional(v.string()),
        }))),
        attributes: v.optional(
          v.object({
            strength: v.optional(v.number()),
            dexterity: v.optional(v.number()),
            constitution: v.optional(v.number()),
            intelligence: v.optional(v.number()),
            wisdom: v.optional(v.number()),
            charisma: v.optional(v.number()),
          })
        ),
        status: v.optional(v.string()),
      })
    ),
    order: v.number(),
    isFinalEncounter: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_adventure", ["adventureId"])
    .index("by_encounter", ["encounterId"]),

  userTokenLedger: defineTable({
    userId: v.string(), // Clerk User ID
    alltimeTokens: v.number(), // Total tokens ever granted or purchased by the user
    tokensRemaining: v.number(), // Current spendable balance
    lastTokenUpdate: v.optional(v.number()), // Timestamp of the last update to token fields
  }).index("by_userId", ["userId"]),

  tokenTransactionHistory: defineTable({
    userId: v.string(), // Clerk User ID, to link to userTokenLedger
    type: v.union( // Type of transaction
      v.literal("initial_grant"),
      v.literal("purchase"),
      v.literal("usage_generate_text"),
      v.literal("usage_generate_object"),
      v.literal("adjustment_manual") // For admin corrections or other types
    ),
    amount: v.number(), // Positive for additions (grants, purchases), negative for deductions (usage)
    timestamp: v.number(), // Timestamp of the transaction
    description: v.optional(v.string()), // Optional details about the transaction
    tokensRemainingAfterTransaction: v.optional(v.number()) // User's token balance after this transaction
  }).index("by_userId", ["userId"])
    .index("by_timestamp", ["timestamp"]),
}); 