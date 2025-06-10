import { query, mutation, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

// Create a new adventure
export const createAdventure = mutation({
  args: {
    planId: v.string(),
    settingId: v.string(),
    ownerId: v.string(),
    playerIds: v.array(v.string()),
    players: v.optional(v.array(v.object({
      userId: v.string(),
      characterId: v.string(),
    }))),
    status: v.optional(v.union(
      v.literal("waitingForPlayers"),
      v.literal("active"),
      v.literal("completed")
    )),
    title: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const adventureId = await ctx.db.insert("adventures", {
      planId: args.planId,
      settingId: args.settingId,
      ownerId: args.ownerId,
      playerIds: args.playerIds,
      players: args.players,
      status: args.status,
      startedAt: args.startedAt,
      endedAt: undefined,
      currentTurnId: undefined,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    });
    return adventureId;
  },
});

// Join an existing adventure
export const joinAdventure = mutation({
  args: {
    adventureId: v.id("adventures"),
    userId: v.string(),
    characterId: v.string(),
  },
  handler: async (ctx, args) => {
    const adventure = await ctx.db.get(args.adventureId);
    if (!adventure) throw new Error("Adventure not found");
    
    // Check if user is already in the adventure
    const existingPlayer = adventure.players?.find(p => p.userId === args.userId);
    if (existingPlayer) {
      throw new Error("User is already in this adventure");
    }
    
    // Check if character is already taken
    const characterTaken = adventure.players?.find(p => p.characterId === args.characterId);
    if (characterTaken) {
      throw new Error("Character is already taken");
    }
    
    // Add the player to the adventure
    const updatedPlayers = [...(adventure.players || []), {
      userId: args.userId,
      characterId: args.characterId,
    }];
    
    const now = Date.now();
    
    await ctx.db.patch(args.adventureId, {
      players: updatedPlayers,
      playerIds: [...adventure.playerIds, args.userId],
      updatedAt: now,
    });
    
    return true;
  },
});

// Create a new turn for an adventure
export const createTurn = mutation({
  args: {
    adventureId: v.id("adventures"),
    encounterId: v.string(),
    title: v.string(),
    narrative: v.string(),
    characters: v.array(v.any()), // Should match character object
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const turnId = await ctx.db.insert("turns", {
      adventureId: args.adventureId,
      encounterId: args.encounterId,
      title: args.title,
      narrative: args.narrative,
      characters: args.characters,
      order: args.order,
      createdAt: now,
      updatedAt: now,
    });
    // Update adventure's currentTurnId
    await ctx.db.patch(args.adventureId, { currentTurnId: turnId, updatedAt: now });
    return turnId;
  },
});

// Update a turn (narrative or characters)
export const updateTurn = mutation({
  args: {
    turnId: v.id("turns"),
    narrative: v.optional(v.string()),
    characters: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: Partial<Doc<"turns">> = { updatedAt: now };
    if (args.narrative !== undefined) patch.narrative = args.narrative;
    if (args.characters !== undefined) patch.characters = args.characters as Doc<"turns">["characters"];
    await ctx.db.patch(args.turnId, patch);
    return true;
  },
});

// Query: Get current adventure and its current turn
export const getCurrentAdventure = query({
  args: { adventureId: v.id("adventures"), refreshKey: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const adventure = await ctx.db.get(args.adventureId);
    if (!adventure) return null;
    let currentTurn = null;
    if (adventure.currentTurnId) {
      currentTurn = await ctx.db.get(adventure.currentTurnId as Id<"turns">);
      console.log("[getCurrentAdventure] loaded currentTurn:", JSON.stringify(currentTurn, null, 2));
    } else {
      console.log("[getCurrentAdventure] No currentTurnId on adventure");
    }
    return { adventure, currentTurn };
  },
});

// Mutation: Get current adventure and process NPC turn if needed
export const getCurrentAdventureWithNpcProcessing = mutation({
  args: { adventureId: v.id("adventures"), refreshKey: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const adventure = await ctx.db.get(args.adventureId);
    if (!adventure) return null;
    let currentTurn = null;
    if (adventure.currentTurnId) {
      currentTurn = await ctx.db.get(adventure.currentTurnId as Id<"turns">);
    } else {
      console.log("[getCurrentAdventureWithNpcProcessing] No currentTurnId on adventure");
    }
    return { adventure, currentTurn };
  },
});

export const createAdventureWithFirstTurn = mutation({
  args: {
    planId: v.string(),
    settingId: v.string(),
    ownerId: v.string(),
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
    }),
    rollRequirement: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    console.log("[createAdventureWithFirstTurn] CALLED");
    const now = Date.now();
    const adventureId = await ctx.db.insert("adventures", {
      planId: args.planId,
      settingId: args.settingId,
      ownerId: args.ownerId,
      playerIds: args.playerIds,
      startedAt: args.startedAt,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    });

    // --- Use rollRequirement from args, no AI calls here ---
    const turn = { ...args.turn };
    if (args.rollRequirement && turn.characters.length > 0) {
      const actor = turn.characters[0];
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
      );
    }
    // Log just before insert
    console.log("[createAdventureWithFirstTurn] INSERT turn:", JSON.stringify(turn, null, 2));

    const turnId = await ctx.db.insert("turns", {
      adventureId,
      ...turn,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(adventureId, { currentTurnId: turnId, updatedAt: now });
    return { adventureId, turnId };
  },
});

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
    return args.playerInput;
  },
});

// Mutation: Submit reply (updates turn with AI result)
export const submitReply = mutation({
  args: {
    turnId: v.id("turns"),
    characterId: v.string(),
    narrativeAction: v.string(),
    rollRequirement: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn) throw new Error("Turn not found");
    const character = turn.characters.find((c) => c.id === args.characterId);
    if (!character) throw new Error("Character not found");
    const prev = turn.narrative || "";
    const narrative = prev ? `${prev}\n\n${args.narrativeAction}` : args.narrativeAction;

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
    );

    await ctx.db.patch(args.turnId, {
      narrative,
      characters: updatedCharacters,
    });
    return await ctx.db.get(args.turnId);
  },
});

// Internal query: Get a turn by ID
export const getTurnById = query({
  args: { turnId: v.id("turns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.turnId);
  },
});

// Query: Get a turn by adventure ID and order
export const getTurnByOrder = query({
  args: { 
    adventureId: v.id("adventures"), 
    order: v.number() 
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .filter((q) => q.eq(q.field("order"), args.order))
      .first();
    return turn;
  },
});

// Query: Get all turns for an adventure ordered by turn order
export const getTurnsByAdventure = query({
  args: { adventureId: v.id("adventures") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .order("asc")
      .collect();
  },
});

// Internal mutation: Patch a turn by ID
export const patchTurn = internalMutation({
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

// Action: Get encounter context (intro/instructions)
export const getEncounterContext = action({
  args: { encounterId: v.string() },
  handler: async () => {
    // TODO: Implement real logic to fetch encounter context
    // Placeholder
    return {
      intro: "Encounter intro goes here.",
      instructions: "Encounter instructions go here.",
    };
  },
});

// Query: Get adventure by ID
export const getAdventureById = query({
  args: { adventureId: v.id("adventures") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.adventureId);
  },
});

// Internal mutation: Patch an adventure by ID
export const patchAdventure = internalMutation({
  args: {
    adventureId: v.id("adventures"),
    patch: v.object({
      currentTurnId: v.optional(v.id("turns")),
      updatedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      // Add other fields as needed
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.adventureId, args.patch);
    return true;
  },
});

// Query: Get turn navigation info (efficient - minimal data transfer)
export const getTurnNavigationInfo = query({
  args: { adventureId: v.id("adventures") },
  handler: async (ctx, args) => {
    // Get adventure with current turn info
    const adventure = await ctx.db.get(args.adventureId);
    if (!adventure) return null;

    // Count total turns efficiently
    const turns = await ctx.db
      .query("turns")
      .withIndex("by_adventure", (q) => q.eq("adventureId", args.adventureId))
      .collect();
    
    const totalTurns = turns.length;

    // Get current turn order if exists
    let currentTurnOrder = null;
    if (adventure.currentTurnId) {
      const currentTurn = await ctx.db.get(adventure.currentTurnId as Id<"turns">);
      currentTurnOrder = currentTurn?.order || null;
    }

    return {
      totalTurns,
      currentTurnOrder
    };
  },
});