'use server'
import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { auth } from "@clerk/nextjs/server"
import type { Id } from "@/convex/_generated/dataModel"
import type { TurnCharacter } from "@/types/adventure"
import { getRollRequirementHelper, getRollModifier, appendNarrative } from "@/lib/services/narrative-service"
import { generateText } from "@/lib/ai"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import { analyzeAndApplyDiceRoll } from "@/lib/services/turn-update-service"
import wait from "waait"

// Placeholder type for ActionAssessment until it's defined in roll-requirement-service.ts
interface ActionAssessment {
  isPlausible: boolean;
  feedback?: string | null;
  rollRequirement?: {
    rollType: string;
    difficulty: number;
    modifier?: number;
  } | null;
}

export async function processTurnReply({ turnId, characterId, narrativeAction }: { turnId: Id<"turns">; characterId: string; narrativeAction: string }) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  
  const turn = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turn) throw new Error("Turn not found")
  
  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId })
  if (!adventure) throw new Error("Adventure not found")
  const plan = (await readJsonFromS3(`settings/${adventure.settingId}/${adventure.planId}.json`)) as AdventurePlan
  if (!plan) throw new Error("Adventure plan not found")
  
  const encounter = plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .find((e) => e.id === turn.encounterId)
  if (!encounter) throw new Error("Encounter not found")
  
  const characterPerformingAction = turn.characters.find(c => c.id === characterId);
  if (!characterPerformingAction) throw new Error("Character performing action not found in turn data");

  // Prepare context for the updated getRollRequirementForAction
  const actionContext = {
    character: {
      name: characterPerformingAction.name,
      // You might need to fetch richer character data if it's not already on the turn.characters object.
      // For example, if character class, stats, or specific abilities are crucial for plausibility:
      // class: characterPerformingAction.class, 
      // abilities: characterPerformingAction.abilities,
    },
    encounter: {
      id: encounter.id,
      // name: encounter.name || "Unnamed Encounter", // Removed as 'name' might not exist
      // description: encounter.description || "No description", // Removed as 'description' might not exist
      instructions: encounter.instructions || "", // Keep instructions if available
    },
    plan: {
      planId: adventure.planId, // Use existing planId
      settingId: adventure.settingId, // Use existing settingId
      // name: plan.name || "Unnamed Plan", // Removed as 'name' might not exist
      // settingDescription: plan.setting?.description || "No setting description", // Removed
    }
  };

  // Call the (soon to be updated) getRollRequirementForAction
  // This function will now also return plausibility and feedback
  // @ts-expect-error // Expecting getRollRequirementForAction to be updated to accept 2 arguments
  const assessment: ActionAssessment = await getRollRequirementForAction(narrativeAction, actionContext)
  console.log("[processTurnReply] action assessment:", assessment)

  if (assessment && assessment.isPlausible === false) {
    // Action is not plausible, return feedback to the user to try again
    return {
      actionImplausible: true,
      feedback: assessment.feedback || "This action is not possible or doesn't make sense in the current situation. Please try something else.",
    }
  }

  // If plausible, proceed with existing logic
  const rollRequirement = assessment ? assessment.rollRequirement : null;

  if (rollRequirement) {
    // Set rollRequirement for the character, do not mark as complete
    await convex.mutation(api.adventure.submitReply, {
      turnId,
      characterId,
      narrativeAction,
      rollRequirement,
    })
    return { rollRequired: rollRequirement }
  } else {
    // Mark character as complete and hasReplied
    await convex.mutation(api.adventure.submitReply, {
      turnId,
      characterId,
      narrativeAction,
      rollRequirement: undefined,
    })
    // After marking player complete, process NPCs
    await processNpcTurnsAfterCurrent(turnId);
    return { rollRequired: null }
  }
}

export async function createAdventureWithFirstTurn(payload: {
  planId: string;
  settingId: string;
  ownerId: string;
  playerIds: string[];
  title: string;
  startedAt: number;
  playerInput: string;
  turn: {
    encounterId: string;
    narrative: string;
    characters: TurnCharacter[];
    order: number;
  };
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  // Prepare context for AI
  const paragraphs = (payload.turn.narrative || "").split(/\n\n+/).filter(Boolean);
  const lastAction = paragraphs[paragraphs.length - 1] || "";
  const encounterIntro = "";
  const encounterInstructions = "";
  const narrativeContext = paragraphs.slice(-2).join("\n\n");
  let rollRequirement = null;
  if (payload.playerInput && payload.playerInput.trim().length > 0) {
    rollRequirement = await getRollRequirementHelper(payload.playerInput, {
      encounterIntro,
      encounterInstructions,
      narrativeContext,
    });
    if (rollRequirement) {
      const actor = payload.turn.characters[0];
      const modifier = await getRollModifier({
        scenario: { encounterIntro, encounterInstructions, narrativeContext },
        rollRequirement,
        character: actor,
      });
      if (typeof modifier === "number") {
        rollRequirement.modifier = modifier;
      }
    }
  }
  if (!rollRequirement && lastAction && lastAction.trim().length > 0) {
    rollRequirement = await getRollRequirementHelper(lastAction, {
      encounterIntro,
      encounterInstructions,
      narrativeContext,
    });
    if (rollRequirement) {
      const actor = payload.turn.characters[0];
      const modifier = await getRollModifier({
        scenario: { encounterIntro, encounterInstructions, narrativeContext },
        rollRequirement,
        character: actor,
      });
      if (typeof modifier === "number") {
        rollRequirement.modifier = modifier;
      }
    }
  }

  // Overwrite ownerId with the authenticated user
  return convex.mutation(api.adventure.createAdventureWithFirstTurn, {
    ...payload,
    settingId: payload.settingId,
    ownerId: userId,
    rollRequirement,
  });
}

export async function resolvePlayerRollResult({
  turnId,
  characterId,
  result,
}: {
  turnId: Id<"turns">;
  characterId: string;
  result: number;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  // 1. Fetch the turn
  const turn = await convex.query(api.adventure.getTurnById, { turnId });
  if (!turn) throw new Error("Turn not found");
  const character = turn.characters.find((c) => c.id === characterId);
  if (!character) throw new Error("Character not found");
  if (!character.rollRequired) throw new Error("No roll required for this character");
  if (typeof character.rollResult === "number") throw new Error("Roll already completed");

  // 2. Fetch the adventure and plan
  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId });
  if (!adventure) throw new Error("Adventure not found");
  const planKey = `settings/${adventure.settingId}/${adventure.planId}.json`;
  const plan = (await readJsonFromS3(planKey)) as AdventurePlan;
  if (!plan || !Array.isArray(plan.sections)) throw new Error("Adventure plan not found or invalid");

  // 3. Extract encounter instructions
  let encounterInstructions = "";
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      const encounter = scene.encounters.find((e: { id: string }) => e.id === turn.encounterId);
      if (encounter) {
        encounterInstructions = encounter.instructions || "";
        break;
      }
    }
    if (encounterInstructions) break;
  }

  // 4. Build the prompt and call the LLM
  const { rollType, difficulty, modifier = 0 } = character.rollRequired;
  const baseRoll = result;
  const totalResult = baseRoll + modifier;
  const success = totalResult >= difficulty;
  const margin = totalResult - difficulty;
  const shortcode = `[DiceRoll:rollType=${rollType};baseRoll=${baseRoll};modifier=${modifier >= 0 ? "+" + modifier : modifier};result=${totalResult};difficulty=${difficulty};character=${character.name};image=${character.image};success=${success}]\n`;

  // LOGGING: Before appending shortcode
  console.log("[appendNarrative] BEFORE shortcode", { prev: turn.narrative, shortcode });
  let newNarrative = appendNarrative(turn.narrative || "", shortcode);
  // LOGGING: After appending shortcode
  console.log("[appendNarrative] AFTER shortcode", { newNarrative });

  const narrativeContext = (turn.narrative || "").split(/\n\n+/).slice(-2).join("\n\n");
  const rollOutcomePrompt = `
Context:
${narrativeContext}

Encounter Instructions:
${encounterInstructions}

Player action: "${shortcode}"

A dice roll was made for ${character.name}: ${rollType} (Result: ${totalResult}, Difficulty: ${difficulty}, Margin: ${margin}).

The margin indicates how close the roll was to the target number. Use this information to inspire the drama, tension, or impact of the outcome, but write a creative, immersive narrative that fits the context. Do not use game terms like "margin" or "DC" in the narrative.

Write a single, concise, immersive third-person PRESENT-tense narrative paragraph (exactly two sentences, max 60 words) describing the outcome of the roll. Only reference things present in the context above. Do not invent new objects, people, or events. Write in third person PRESENT tense. Do not use lists, bullet points, or markdown formatting. Do not use semicolons in your response. Never mention game mechanics, dice, or rules in your response.

Output only the narrative paragraph.`.trim();

  let rollOutcome = "";
  try {
    const { text } = await generateText({ prompt: rollOutcomePrompt });
    rollOutcome = text;
    // LOGGING: Before appending rollOutcome
    console.log("[appendNarrative] BEFORE rollOutcome", { prev: newNarrative, rollOutcome });
    newNarrative = appendNarrative(newNarrative, rollOutcome);
    // LOGGING: After appending rollOutcome
    console.log("[appendNarrative] AFTER rollOutcome", { newNarrative });
  } catch (err) {
    console.error("[resolvePlayerRollResult] Error generating roll outcome:", err);
  }

  // 5. Use analyzeAndApplyDiceRoll to update healthPercent/status if needed
  const diceRoll = {
    rollType,
    baseRoll,
    modifier,
    result: totalResult,
    difficulty,
    character: character.name,
    success,
  };
  await wait(500)
  const updatedTurn = await analyzeAndApplyDiceRoll({
    turn: { 
      ...turn, 
      characters: turn.characters.map(c => ({
        ...c,
        healthPercent: typeof c.healthPercent === "number" ? c.healthPercent : 100,
      })),
    },
    diceRoll,
    narrative: newNarrative,
  });

  // Ensure the rolling character is marked complete and roll fields are set
  const updatedCharacters = updatedTurn.characters.map(c =>
    c.id === characterId
      ? {
          ...c,
          rollRequired: undefined,
          rollResult: totalResult,
          isComplete: true,
          hasReplied: true,
        }
      : c
  );

  // 6. Patch the turn with the new narrative and character state
  await convex.mutation(api.turns.updateTurn, {
    turnId,
    patch: {
      narrative: newNarrative,
      characters: updatedCharacters,
      updatedAt: Date.now(),
    },
  });

  // After marking player complete, process NPCs
  await processNpcTurnsAfterCurrent(turnId);

  // 7. Return the updated turn
  return await convex.query(api.adventure.getTurnById, { turnId });
} 