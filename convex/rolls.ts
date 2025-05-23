import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

// Mutation: Only updates the turn and character state, can accept a new narrative
export const setPlayerRollResult = mutation({
  args: {
    turnId: v.id("turns"),
    characterId: v.string(),
    rollResult: v.number(),
    newNarrative: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[setPlayerRollResult] called with args:", JSON.stringify(args, null, 2));
    const turn = (await ctx.db.get(args.turnId)) as Doc<"turns">;
    if (!turn) throw new Error("Turn not found");
    const character = turn.characters.find((c: Doc<"turns">["characters"][number]) => c.id === args.characterId);
    if (!character) throw new Error("Character not found");
    if (!character.rollRequired) throw new Error("No roll required for this character");
    if (typeof character.rollResult === "number") throw new Error("Roll already completed");
    const { rollType, difficulty, modifier = 0 } = character.rollRequired;
    const baseRoll = args.rollResult;
    const result = baseRoll + modifier;
    const success = result >= difficulty;
    // Append [DiceRoll:...] shortcode to narrative if newNarrative not provided
    let newNarrative = args.newNarrative;
    if (!newNarrative) {
      const shortcode = `[DiceRoll:rollType=${rollType};baseRoll=${baseRoll};modifier=${modifier >= 0 ? "+" + modifier : modifier};result=${result};difficulty=${difficulty};character=${character.name};image=${character.image};success=${success}]\n`;
      newNarrative = (turn.narrative || "") + "\n\n" + shortcode;
    }
    // Update character state
    const updatedCharacters = turn.characters.map((c: Doc<"turns">["characters"][number]) =>
      c.id === args.characterId
        ? {
            ...c,
            rollResult: result,
            isComplete: true,
            hasReplied: true,
          }
        : c
    );
    // Patch turn
    await ctx.db.patch(args.turnId, {
      narrative: newNarrative,
      characters: updatedCharacters,
      updatedAt: Date.now(),
    });
    console.log("[setPlayerRollResult] Patched turn with new narrative:", newNarrative);
    return await ctx.db.get(args.turnId);
  },
});

// Internal query to fetch the turn
export const getTurnForRoll = internalQuery({
  args: { turnId: v.id("turns") },
  handler: async (ctx, args) => {
    return (await ctx.db.get(args.turnId)) as Doc<"turns"> | null;
  },
});

// Internal mutation to patch the turn
export const patchTurnWithRoll = internalMutation({
  args: {
    turnId: v.id("turns"),
    characterId: v.string(),
    rollResult: v.number(),
    newNarrative: v.string(),
  },
  handler: async (ctx, args) => {
    const turn = (await ctx.db.get(args.turnId)) as Doc<"turns"> | null;
    if (!turn) throw new Error("Turn not found");
    const updatedCharacters = turn.characters.map((c: Doc<"turns">["characters"][number]) =>
      c.id === args.characterId
        ? { ...c, rollResult: args.rollResult, isComplete: true, hasReplied: true }
        : c
    );
    await ctx.db.patch(args.turnId, {
      narrative: args.newNarrative,
      characters: updatedCharacters,
      updatedAt: Date.now(),
    });
    return true;
  },
}); 