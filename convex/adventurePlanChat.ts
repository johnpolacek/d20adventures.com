import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const scopeValidator = v.optional(
  v.object({
    label: v.string(),
    target: v.string(),
    sectionIndex: v.optional(v.number()),
    sceneIndex: v.optional(v.number()),
    encounterId: v.optional(v.string()),
  })
)

const proposalValidator = v.optional(
  v.object({
    status: v.union(v.literal("proposed"), v.literal("used"), v.literal("dismissed")),
    target: v.string(),
    kind: v.optional(v.union(v.literal("text"), v.literal("structure"))),
    suggestedText: v.string(),
    operationsJson: v.optional(v.string()),
    sourceMessageId: v.optional(v.id("adventure_plan_chat_messages")),
  })
)

const contextReportValidator = v.optional(
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
)

export const appendMessage = mutation({
  args: {
    settingId: v.string(),
    adventurePlanId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("event")),
    userId: v.string(),
    displayName: v.string(),
    content: v.string(),
    scope: scopeValidator,
    proposal: proposalValidator,
    contextReport: contextReportValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("adventure_plan_chat_messages", {
      ...args,
      content: args.content.slice(0, 12000),
      proposal: args.proposal
        ? {
            ...args.proposal,
            suggestedText: args.proposal.suggestedText.slice(0, 12000),
            operationsJson: args.proposal.operationsJson?.slice(0, 60000),
          }
        : undefined,
      createdAt: Date.now(),
    })
  },
})

export const updateProposalStatus = mutation({
  args: {
    messageId: v.id("adventure_plan_chat_messages"),
    status: v.union(v.literal("used"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (!message?.proposal) return null

    await ctx.db.patch(args.messageId, {
      proposal: {
        ...message.proposal,
        status: args.status,
      },
    })

    return args.messageId
  },
})

export const getRecent = query({
  args: {
    settingId: v.string(),
    adventurePlanId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200)
    const rows = await ctx.db
      .query("adventure_plan_chat_messages")
      .withIndex("by_plan_created", (q) => q.eq("settingId", args.settingId).eq("adventurePlanId", args.adventurePlanId))
      .order("desc")
      .take(limit)

    return rows.reverse()
  },
})

export const getAllForPlan = query({
  args: {
    settingId: v.string(),
    adventurePlanId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("adventure_plan_chat_messages")
      .withIndex("by_plan_created", (q) => q.eq("settingId", args.settingId).eq("adventurePlanId", args.adventurePlanId))
      .order("asc")
      .collect()
  },
})

export const getBefore = query({
  args: {
    settingId: v.string(),
    adventurePlanId: v.string(),
    before: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200)
    const rows = await ctx.db
      .query("adventure_plan_chat_messages")
      .withIndex("by_plan_created", (q) => q.eq("settingId", args.settingId).eq("adventurePlanId", args.adventurePlanId).lt("createdAt", args.before))
      .order("desc")
      .take(limit)

    return rows.reverse()
  },
})
