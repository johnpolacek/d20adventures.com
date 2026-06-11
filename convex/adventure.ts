import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { action, internalMutation, mutation, query } from "./_generated/server"

const contentRefValidator = v.object({
  source: v.union(v.literal("published"), v.literal("preview")),
  settingId: v.string(),
  planId: v.string(),
  contentVersion: v.optional(v.string()),
  contentHash: v.optional(v.string()),
  versionId: v.optional(v.string()),
  previewDraftId: v.optional(v.string()),
  schemaVersion: v.string(),
})

const generatedByValidator = v.object({
  model: v.optional(v.string()),
  promptVersion: v.optional(v.string()),
  contextHash: v.optional(v.string()),
})

// Create a new adventure
export const createAdventure = mutation({
  args: {
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
    contentRef: v.optional(contentRefValidator),
    currentEncounterId: v.optional(v.string()),
    adventureSummaryMarkdown: v.optional(v.string()),
    title: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const adventureId = await ctx.db.insert("adventures", {
      planId: args.planId,
      settingId: args.settingId,
      ownerId: args.ownerId,
      runType: args.runType ?? "campaign",
      parentAdventureId: args.parentAdventureId,
      parentTurnId: args.parentTurnId,
      playerIds: args.playerIds,
      players: args.players,
      status: args.status,
      startedAt: args.startedAt,
      endedAt: undefined,
      currentTurnId: undefined,
      currentEncounterId: args.currentEncounterId,
      contentRef: args.contentRef,
      adventureSummaryMarkdown: args.adventureSummaryMarkdown,
      discoveries: [],
      entityUpdates: [],
      openThreads: [],
      resolvedThreadIds: [],
      title: args.title,
      createdAt: now,
      updatedAt: now,
    })
    return adventureId
  },
})

// Join an existing adventure
export const joinAdventure = mutation({
  args: {
    adventureId: v.id("adventures"),
    userId: v.string(),
    characterId: v.string(),
  },
  handler: async (ctx, args) => {
    const adventure = await ctx.db.get(args.adventureId)
    if (!adventure) throw new Error("Adventure not found")
    if ((adventure.runType ?? "campaign") === "practice") {
      throw new Error("Practice runs are private and do not allow joining")
    }

    // Check if user is already in the adventure
    const existingPlayer = adventure.players?.find((p) => p.userId === args.userId)
    if (existingPlayer) {
      throw new Error("User is already in this adventure")
    }

    // Check if character is already taken
    const characterTaken = adventure.players?.find((p) => p.characterId === args.characterId)
    if (characterTaken) {
      throw new Error("Character is already taken")
    }

    // Add the player to the adventure
    const updatedPlayers = [
      ...(adventure.players || []),
      {
        userId: args.userId,
        characterId: args.characterId,
      },
    ]

    const now = Date.now()

    await ctx.db.patch(args.adventureId, {
      players: updatedPlayers,
      playerIds: [...adventure.playerIds, args.userId],
      updatedAt: now,
    })

    return true
  },
})

// Create a new turn for an adventure
export const createTurn = mutation({
  args: {
    adventureId: v.id("adventures"),
    encounterId: v.string(),
    title: v.string(),
    narrative: v.string(),
    characters: v.array(v.any()), // Should match character object
    order: v.number(),
    adventurePatch: v.optional(v.any()),
    transition: v.optional(v.any()),
    generatedBy: v.optional(generatedByValidator),
  },
  handler: async (ctx, args) => {
    // Check for duplicate order
    const existing = await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .filter((q) => q.eq(q.field("order"), args.order))
      .first()
    if (existing) {
      throw new Error(`A turn with order ${args.order} already exists for this adventure.`)
    }
    const now = Date.now()
    const turnId = await ctx.db.insert("turns", {
      adventureId: args.adventureId,
      encounterId: args.encounterId,
      title: args.title,
      narrative: args.narrative,
      characters: args.characters,
      order: args.order,
      adventurePatch: args.adventurePatch,
      transition: args.transition,
      generatedBy: args.generatedBy,
      createdAt: now,
      updatedAt: now,
    })
    // Update adventure's currentTurnId
    await ctx.db.patch(args.adventureId, {
      currentTurnId: turnId,
      currentEncounterId: args.encounterId,
      status: "active",
      updatedAt: now,
    })
    return turnId
  },
})

// Update a turn (narrative or characters)
export const updateTurn = mutation({
  args: {
    turnId: v.id("turns"),
    narrative: v.optional(v.string()),
    characters: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const patch: Partial<Doc<"turns">> = { updatedAt: now }
    if (args.narrative !== undefined) patch.narrative = args.narrative
    if (args.characters !== undefined) patch.characters = args.characters as Doc<"turns">["characters"]
    await ctx.db.patch(args.turnId, patch)
    return true
  },
})

// Query: Get current adventure and its current turn
export const getCurrentAdventure = query({
  args: { adventureId: v.id("adventures"), refreshKey: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const adventure = await ctx.db.get(args.adventureId)
    if (!adventure) return null
    let currentTurn = null
    if (adventure.currentTurnId) {
      currentTurn = await ctx.db.get(adventure.currentTurnId as Id<"turns">)
    }
    return { adventure, currentTurn }
  },
})

// Mutation: Get current adventure and process NPC turn if needed
export const getCurrentAdventureWithNpcProcessing = mutation({
  args: { adventureId: v.id("adventures"), refreshKey: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const adventure = await ctx.db.get(args.adventureId)
    if (!adventure) return null
    let currentTurn = null
    if (adventure.currentTurnId) {
      currentTurn = await ctx.db.get(adventure.currentTurnId as Id<"turns">)
    } else {
    }
    return { adventure, currentTurn }
  },
})

export const createAdventureWithFirstTurn = mutation({
  args: {
    planId: v.string(),
    settingId: v.string(),
    ownerId: v.string(),
    runType: v.optional(v.union(v.literal("campaign"), v.literal("practice"))),
    parentAdventureId: v.optional(v.id("adventures")),
    parentTurnId: v.optional(v.id("turns")),
    playerIds: v.array(v.string()),
    title: v.string(),
    startedAt: v.number(),
    playerInput: v.string(),
    turn: v.object({
      encounterId: v.string(),
      title: v.string(),
      narrative: v.string(),
      characters: v.array(v.any()),
      order: v.number(),
      adventurePatch: v.optional(v.any()),
      transition: v.optional(v.any()),
      generatedBy: v.optional(generatedByValidator),
    }),
    rollRequirement: v.optional(v.any()),
    contentRef: v.optional(contentRefValidator),
    currentEncounterId: v.optional(v.string()),
    adventureSummaryMarkdown: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const adventureId = await ctx.db.insert("adventures", {
      planId: args.planId,
      settingId: args.settingId,
      ownerId: args.ownerId,
      runType: args.runType ?? "campaign",
      parentAdventureId: args.parentAdventureId,
      parentTurnId: args.parentTurnId,
      playerIds: args.playerIds,
      startedAt: args.startedAt,
      title: args.title,
      status: "active",
      currentEncounterId: args.currentEncounterId ?? args.turn.encounterId,
      contentRef: args.contentRef,
      adventureSummaryMarkdown: args.adventureSummaryMarkdown,
      discoveries: [],
      entityUpdates: [],
      openThreads: [],
      resolvedThreadIds: [],
      createdAt: now,
      updatedAt: now,
    })

    // --- Use rollRequirement from args, no AI calls here ---
    const turn = { ...args.turn }
    if (args.rollRequirement && turn.characters.length > 0) {
      const actor = turn.characters[0]
      turn.characters = turn.characters.map((c) =>
        c.id === actor.id
          ? {
              ...c,
              hasReplied: true,
              isComplete: !args.rollRequirement,
              rollRequired: args.rollRequirement || undefined,
              rollResult: undefined,
            }
          : c
      )
    }
    // Log just before insert

    const turnId = await ctx.db.insert("turns", {
      adventureId,
      ...turn,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(adventureId, { currentTurnId: turnId, updatedAt: now })
    return { adventureId, turnId }
  },
})

// Action: AI rewrite of reply (no DB access)
export const aiRewriteReply = action({
  args: {
    characterName: v.string(),
    playerInput: v.string(),
    narrativeContext: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // TODO: Call your AI service here (Google Gemini, etc.)
    // For now, just return the playerInput as a placeholder
    return args.playerInput
  },
})

// Mutation: Submit reply (updates turn with AI result)
export const submitReply = mutation({
  args: {
    turnId: v.id("turns"),
    characterId: v.string(),
    narrativeAction: v.string(),
    originalPlayerInput: v.optional(v.string()),
    rollRequirement: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId)
    if (!turn) throw new Error("Turn not found")
    const character = turn.characters.find((c) => c.id === args.characterId)
    if (!character) throw new Error("Character not found")
    const prev = turn.narrative || ""

    // Build narrative with original reply tag if provided
    let narrativeToAdd = args.narrativeAction
    if (args.originalPlayerInput) {
      narrativeToAdd = `[OriginalReply: ${args.originalPlayerInput}]\n${args.narrativeAction}`
    }

    const narrative = prev ? `${prev}\n\n${narrativeToAdd}` : narrativeToAdd

    // Use rollRequirement from args, do not call AI here!
    const updatedCharacters = turn.characters.map((c) =>
      c.id === args.characterId
        ? {
            ...c,
            hasReplied: true,
            isComplete: !args.rollRequirement,
            rollRequired: args.rollRequirement || undefined,
            rollResult: undefined,
          }
        : c
    )

    await ctx.db.patch(args.turnId, {
      narrative,
      characters: updatedCharacters,
    })
    return await ctx.db.get(args.turnId)
  },
})

// Internal query: Get a turn by ID
export const getTurnById = query({
  args: { turnId: v.id("turns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.turnId)
  },
})

// Query: Get a turn by adventure ID and order
export const getTurnByOrder = query({
  args: {
    adventureId: v.id("adventures"),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .filter((q) => q.eq(q.field("order"), args.order))
      .first()
    return turn
  },
})

// Query: Get all turns for an adventure ordered by turn order
export const getTurnsByAdventure = query({
  args: { adventureId: v.id("adventures") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .order("asc")
      .collect()
  },
})

// Internal mutation: Patch a turn by ID
export const patchTurn = mutation({
  args: {
    turnId: v.id("turns"),
    patch: v.object({
      narrative: v.optional(v.string()),
      characters: v.optional(v.array(v.any())),
      updatedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.turnId, args.patch)
    return true
  },
})

// Action: Get encounter context (intro/instructions)
export const getEncounterContext = action({
  args: { encounterId: v.string() },
  handler: async () => {
    // TODO: Implement real logic to fetch encounter context
    // Placeholder
    return {
      intro: "Encounter intro goes here.",
      instructions: "Encounter instructions go here.",
    }
  },
})

// Query: Get adventure by ID
export const getAdventureById = query({
  args: { adventureId: v.id("adventures") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.adventureId)
  },
})

// Internal mutation: Patch an adventure by ID
export const patchAdventure = mutation({
  args: {
    adventureId: v.id("adventures"),
    patch: v.object({
      currentTurnId: v.optional(v.id("turns")),
      currentEncounterId: v.optional(v.string()),
      contentRef: v.optional(contentRefValidator),
      adventureSummaryMarkdown: v.optional(v.string()),
      discoveries: v.optional(v.array(v.any())),
      entityUpdates: v.optional(v.array(v.any())),
      openThreads: v.optional(v.array(v.any())),
      resolvedThreadIds: v.optional(v.array(v.string())),
      updatedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      status: v.optional(v.union(v.literal("waitingForPlayers"), v.literal("active"), v.literal("completed"))),
      // Add other fields as needed
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.adventureId, args.patch)
    return true
  },
})

export const commitWikiTurnAdvance = mutation({
  args: {
    adventureId: v.id("adventures"),
    expectedCurrentTurnId: v.id("turns"),
    expectedCurrentEncounterId: v.string(),
    expectedContentHash: v.optional(v.string()),
    nextEncounterId: v.string(),
    title: v.string(),
    narrative: v.string(),
    characters: v.array(v.any()),
    order: v.number(),
    adventurePatch: v.optional(v.any()),
    transition: v.optional(v.any()),
    generatedBy: v.optional(generatedByValidator),
    isFinalEncounter: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const adventure = await ctx.db.get(args.adventureId)
    if (!adventure) throw new Error("Adventure not found")
    if (adventure.currentTurnId !== args.expectedCurrentTurnId) {
      throw new Error("Stale turn advance: current turn changed")
    }
    if ((adventure.currentEncounterId ?? args.expectedCurrentEncounterId) !== args.expectedCurrentEncounterId) {
      throw new Error("Stale turn advance: current encounter changed")
    }
    if (args.expectedContentHash && adventure.contentRef?.contentHash !== args.expectedContentHash) {
      throw new Error("Stale turn advance: content hash changed")
    }

    const existing = await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .filter((q) => q.eq(q.field("order"), args.order))
      .first()
    if (existing) throw new Error(`A turn with order ${args.order} already exists for this adventure.`)

    const now = Date.now()
    const turnId = await ctx.db.insert("turns", {
      adventureId: args.adventureId,
      encounterId: args.nextEncounterId,
      title: args.title,
      narrative: args.narrative,
      characters: args.characters,
      order: args.order,
      isFinalEncounter: args.isFinalEncounter,
      adventurePatch: args.adventurePatch,
      transition: args.transition,
      generatedBy: args.generatedBy,
      createdAt: now,
      updatedAt: now,
    })

    const discoveries = [...(adventure.discoveries ?? []), ...((args.adventurePatch?.discoveries as unknown[]) ?? [])]
    const entityUpdates = [...(adventure.entityUpdates ?? []), ...((args.adventurePatch?.entityUpdates as unknown[]) ?? [])]
    const openThreads = mergeThreads(adventure.openThreads ?? [], (args.adventurePatch?.openThreads as Array<{ id?: string }> | undefined) ?? [], (args.adventurePatch?.resolvedThreadIds as string[] | undefined) ?? [])
    const resolvedThreadIds = Array.from(new Set([...(adventure.resolvedThreadIds ?? []), ...((args.adventurePatch?.resolvedThreadIds as string[] | undefined) ?? [])]))
    const summaryDelta = typeof args.adventurePatch?.summaryDelta === "string" ? args.adventurePatch.summaryDelta : ""
    const adventureSummaryMarkdown = summaryDelta ? [adventure.adventureSummaryMarkdown, summaryDelta].filter(Boolean).join("\n\n") : adventure.adventureSummaryMarkdown

    await ctx.db.patch(args.adventureId, {
      currentTurnId: turnId,
      currentEncounterId: args.nextEncounterId,
      adventureSummaryMarkdown,
      discoveries,
      entityUpdates,
      openThreads,
      resolvedThreadIds,
      status: args.isFinalEncounter ? "completed" : "active",
      endedAt: args.isFinalEncounter ? now : adventure.endedAt,
      updatedAt: now,
    })

    return { turnId, adventureId: args.adventureId }
  },
})

function mergeThreads(existing: unknown[], added: Array<{ id?: string }>, resolvedIds: string[]): unknown[] {
  const resolved = new Set(resolvedIds)
  const byId = new Map<string, unknown>()
  for (const thread of existing) {
    const id = thread && typeof thread === "object" && "id" in thread ? String((thread as { id: unknown }).id) : ""
    if (id && !resolved.has(id)) byId.set(id, thread)
  }
  for (const thread of added) {
    if (thread.id && !resolved.has(thread.id)) byId.set(thread.id, thread)
  }
  return [...byId.values()]
}

// Query: Get turn navigation info (efficient - minimal data transfer)
export const getTurnNavigationInfo = query({
  args: { adventureId: v.id("adventures") },
  handler: async (ctx, args) => {
    // Get adventure with current turn info
    const adventure = await ctx.db.get(args.adventureId)
    if (!adventure) return null

    // Count total turns efficiently
    const turns = await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .collect()

    const totalTurns = turns.length

    // Get current turn order if exists
    let currentTurnOrder = null
    if (adventure.currentTurnId) {
      const currentTurn = await ctx.db.get(adventure.currentTurnId as Id<"turns">)
      currentTurnOrder = currentTurn?.order || null
    }

    return {
      totalTurns,
      currentTurnOrder,
    }
  },
})

// Query: Get all adventures (for admin)
export const getAllAdventures = query({
  handler: async (ctx) => {
    return await ctx.db.query("adventures").order("desc").collect()
  },
})

export const getAdventuresByPlayer = query({
  args: {
    playerId: v.string(),
    status: v.optional(v.union(v.literal("waitingForPlayers"), v.literal("active"), v.literal("completed"))),
    runType: v.optional(v.union(v.literal("campaign"), v.literal("practice"))),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("adventures").withIndex("by_started").order("desc")
    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status))
    }
    if (args.runType) {
      q = q.filter((q) => q.eq(q.field("runType"), args.runType))
    }
    const all = await q.collect()
    return all.filter((a) => Array.isArray(a.playerIds) && a.playerIds.includes(args.playerId))
  },
})

// Query: Get adventure lobby data with real-time updates
export const getAdventureLobbyData = query({
  args: { adventureId: v.id("adventures") },
  handler: async (ctx, args) => {
    const adventure = await ctx.db.get(args.adventureId)
    if (!adventure) return null
    return {
      id: adventure._id,
      title: adventure.title,
      status: adventure.status,
      players: adventure.players || [],
      playerIds: adventure.playerIds || [],
      updatedAt: adventure.updatedAt,
    }
  },
})
