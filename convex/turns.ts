import { v } from "convex/values"
import { adventurePatchValidator, applyAdventurePatch, createTurnArgs, insertTurn } from "./lib/adventureTransitions"
import { serverMutation } from "./serverSecret"
import { pendingReactionValidator, storyValidator } from "./story"

// Minimal mutation: create a new turn (caller patches the adventure separately)
export const createTurn = serverMutation({
  args: createTurnArgs,
  handler: async (ctx, args) => insertTurn(ctx, args, { activateAdventure: false }),
})

// Minimal mutation: update a turn (patch)
export const updateTurn = serverMutation({
  args: {
    turnId: v.id("turns"),
    patch: v.object({
      story: v.optional(storyValidator),
      characters: v.optional(v.array(v.any())),
      updatedAt: v.optional(v.number()),
      // The reaction the round waits on, as the engine keeps it. Null clears it.
      reaction: v.optional(v.union(pendingReactionValidator, v.null())),
    }),
  },
  handler: async (ctx, args) => {
    const { reaction, ...patch } = args.patch
    await ctx.db.patch(args.turnId, { ...patch, ...(reaction === undefined ? {} : { reaction: reaction ?? undefined }) })
    return true
  },
})

// Minimal mutation: patch adventure (shared guarded handler with convex/adventure.ts)
export const patchAdventure = serverMutation({
  args: {
    adventureId: v.id("adventures"),
    patch: adventurePatchValidator,
  },
  handler: async (ctx, args) => applyAdventurePatch(ctx, args.adventureId, args.patch),
})
