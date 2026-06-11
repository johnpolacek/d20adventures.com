import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

// Define your schema
export default defineSchema({
  visits: defineTable({
    path: v.string(),
    userId: v.union(v.string(), v.null()),
    metadata: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
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
  })
    .index("by_email", ["email"])
    .index("by_user", ["userId"])
    .index("by_subscribed", ["subscribedAt"]),

  // Multiplayer Adventure Tables
  adventures: defineTable({
    planId: v.string(),
    settingId: v.string(),
    ownerId: v.string(),
    runType: v.optional(v.union(v.literal("campaign"), v.literal("practice"))),
    parentAdventureId: v.optional(v.id("adventures")),
    parentTurnId: v.optional(v.id("turns")),
    playerIds: v.array(v.string()),
    players: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          characterId: v.string(),
        })
      )
    ),
    status: v.optional(v.union(v.literal("waitingForPlayers"), v.literal("active"), v.literal("completed"))),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    currentTurnId: v.optional(v.id("turns")),
    currentEncounterId: v.optional(v.string()),
    contentRef: v.optional(
      v.object({
        source: v.union(v.literal("published"), v.literal("preview")),
        settingId: v.string(),
        planId: v.string(),
        contentVersion: v.optional(v.string()),
        contentHash: v.optional(v.string()),
        versionId: v.optional(v.string()),
        previewDraftId: v.optional(v.string()),
        schemaVersion: v.string(),
      })
    ),
    adventureSummaryMarkdown: v.optional(v.string()),
    discoveries: v.optional(v.array(v.any())),
    entityUpdates: v.optional(v.array(v.any())),
    openThreads: v.optional(v.array(v.any())),
    resolvedThreadIds: v.optional(v.array(v.string())),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_player", ["playerIds"])
    .index("by_started", ["startedAt"]),

  adventure_reports: defineTable({
    adventureId: v.id("adventures"),
    ownerId: v.string(),
    runType: v.union(v.literal("campaign"), v.literal("practice")),
    trigger: v.literal("on_demand"),
    status: v.union(v.literal("ready"), v.literal("failed")),
    report: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_adventure_created", ["adventureId", "createdAt"])
    .index("by_owner_created", ["ownerId", "createdAt"]),

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
        equipment: v.optional(
          v.array(
            v.object({
              name: v.string(),
              description: v.optional(v.string()),
            })
          )
        ),
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
        spells: v.optional(
          v.array(
            v.object({
              name: v.string(),
              description: v.optional(v.string()),
              isUsed: v.optional(v.boolean()),
            })
          )
        ),
        specialAbilities: v.optional(v.array(v.string())),
        status: v.optional(v.string()),
        effects: v.optional(
          v.array(
            v.object({
              name: v.string(),
              description: v.optional(v.string()),
              duration: v.optional(v.number()),
              status: v.optional(v.string()),
              healthPercentDelta: v.optional(v.number()),
              equipmentToAdd: v.optional(
                v.array(
                  v.object({
                    name: v.string(),
                    description: v.optional(v.string()),
                  })
                )
              ),
            })
          )
        ),
      })
    ),
    order: v.number(),
    isFinalEncounter: v.optional(v.boolean()),
    adventurePatch: v.optional(v.any()),
    transition: v.optional(v.any()),
    generatedBy: v.optional(
      v.object({
        model: v.optional(v.string()),
        promptVersion: v.optional(v.string()),
        contextHash: v.optional(v.string()),
      })
    ),
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
    type: v.union(
      // Type of transaction
      v.literal("initial_grant"),
      v.literal("purchase"),
      v.literal("usage_generate_text"),
      v.literal("usage_generate_object"),
      v.literal("usage_image_upload"),
      v.literal("usage_join_adventure"),
      v.literal("adjustment_refund"),
      v.literal("adjustment_manual") // For admin corrections or other types
    ),
    amount: v.number(), // Positive for additions (grants, purchases), negative for deductions (usage)
    timestamp: v.number(), // Timestamp of the transaction
    tokensRemainingAfterTransaction: v.optional(v.number()), // User's token balance after this transaction
  })
    .index("by_userId", ["userId"])
    .index("by_timestamp", ["timestamp"]),

  // Per-adventure game chat (text only)
  chat_messages: defineTable({
    adventureId: v.id("adventures"),
    username: v.string(),
    characterName: v.optional(v.string()),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_adventure_created", ["adventureId", "createdAt"]),

  // Shared authoring chat for the S3-backed Adventure Plan editor.
  adventure_plan_chat_messages: defineTable({
    settingId: v.string(),
    adventurePlanId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("event")),
    userId: v.string(),
    displayName: v.string(),
    content: v.string(),
    scope: v.optional(
      v.object({
        label: v.string(),
        target: v.string(),
        sectionIndex: v.optional(v.number()),
        sceneIndex: v.optional(v.number()),
        encounterId: v.optional(v.string()),
      })
    ),
    proposal: v.optional(
      v.object({
        status: v.union(v.literal("proposed"), v.literal("used"), v.literal("dismissed")),
        target: v.string(),
        kind: v.optional(v.union(v.literal("text"), v.literal("structure"))),
        suggestedText: v.string(),
        operationsJson: v.optional(v.string()),
        sourceMessageId: v.optional(v.id("adventure_plan_chat_messages")),
      })
    ),
    contextReport: v.optional(
      v.object({
        modelId: v.string(),
        contextWindowTokens: v.number(),
        estimatedPromptTokens: v.number(),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        percentUsed: v.number(),
        includedMessages: v.number(),
        omittedMessages: v.number(),
        status: v.union(v.literal("ok"), v.literal("warning"), v.literal("critical"), v.literal("unknown")),
      })
    ),
    createdAt: v.number(),
  }).index("by_plan_created", ["settingId", "adventurePlanId", "createdAt"]),
})
