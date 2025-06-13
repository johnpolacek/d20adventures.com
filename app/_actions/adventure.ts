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
import type { Adventure } from "@/types/adventure"
import type { PC } from "@/types/character"

// Placeholder type for ActionAssessment until it's defined in roll-requirement-service.ts
interface ActionAssessment {
  isPlausible?: boolean;
  feedback?: string | null;
  rollRequirement?: {
    rollType: string;
    difficulty: number;
    modifier?: number;
  } | null;
  rollType?: string;
  difficulty?: number;
  modifier?: number;
}

export async function processTurnReply({ turnId, characterId, narrativeAction }: { turnId: Id<"turns">; characterId: string; narrativeAction: string }) {
  console.log('[processTurnReply] CALLED')
  const { userId } = await auth()
  if (!userId) {
    console.error('[processTurnReply] Unauthorized access attempt.');
    throw new Error("Unauthorized")
  }
  
  const turn = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turn) {
    console.error('[processTurnReply] Turn not found for turnId:', turnId);
    throw new Error("Turn not found")
  }
  
  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId })
  if (!adventure) {
    console.error('[processTurnReply] Adventure not found for adventureId:', turn.adventureId);
    throw new Error("Adventure not found")
  }
  
  const planPath = `settings/${adventure.settingId}/${adventure.planId}.json`;
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!plan) {
    console.error('[processTurnReply] Adventure plan not found at path:', planPath);
    throw new Error("Adventure plan not found")
  }
  
  const encounter = plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .find((e) => e.id === turn.encounterId)
  if (!encounter) {
    console.error('[processTurnReply] Encounter not found for encounterId:', turn.encounterId);
    throw new Error("Encounter not found")
  }
  console.log('[processTurnReply] Fetched encounter:', JSON.stringify(encounter, null, 2));
  
  const characterPerformingAction = turn.characters.find(c => c.id === characterId);
  if (!characterPerformingAction) {
    console.error('[processTurnReply] Character performing action not found for characterId:', characterId);
    throw new Error("Character performing action not found in turn data");
  }
  console.log('[processTurnReply] Character performing action:', JSON.stringify(characterPerformingAction, null, 2));

  // Prepare context for the updated getRollRequirementForAction
  const actionContext = {
    character: {
      name: characterPerformingAction.name,
      archetype: characterPerformingAction.archetype,
      race: characterPerformingAction.race,
      attributes: characterPerformingAction.attributes,
      skills: characterPerformingAction.skills,
      equipment: characterPerformingAction.equipment,
    },
    encounter: {
      id: encounter.id,
      instructions: encounter.instructions || "",
    },
    plan: {
      planId: adventure.planId,
      settingId: adventure.settingId,
    }
  };
  console.log('[processTurnReply] Action context for getRollRequirementForAction:', JSON.stringify(actionContext, null, 2));

  // Call the (soon to be updated) getRollRequirementForAction
  // This function will now also return plausibility and feedback
  const assessment: ActionAssessment = await getRollRequirementForAction(narrativeAction, characterPerformingAction as import("@/types/character").Character)
  console.log("[processTurnReply] action assessment from getRollRequirementForAction:", JSON.stringify(assessment, null, 2));

  if (assessment && assessment.isPlausible === false) {
    // Action is not plausible, return feedback to the user to try again
    console.log('[processTurnReply] Action deemed implausible. Feedback:', assessment.feedback);
    return {
      actionImplausible: true,
      feedback: assessment.feedback || "This action is not possible or doesn't make sense in the current situation. Please try something else.",
    }
  }
  console.log('[processTurnReply] Action deemed plausible or plausibility check not present.');

  // If plausible, proceed with existing logic
  let rollRequirementDetails = null;
  if (assessment?.rollRequirement) {
    rollRequirementDetails = assessment.rollRequirement;
  } else if (assessment?.rollType && typeof assessment.difficulty === 'number') {
    rollRequirementDetails = {
      rollType: assessment.rollType,
      difficulty: assessment.difficulty,
      modifier: assessment.modifier,
    };
  }

  console.log('[processTurnReply] Derived rollRequirementDetails:', JSON.stringify(rollRequirementDetails, null, 2));

  if (rollRequirementDetails && rollRequirementDetails.rollType && typeof rollRequirementDetails.difficulty === 'number') {
    console.log('[processTurnReply] Roll IS required. Calling getRollModifier...');
    
    // Calculate modifier using the enhanced getRollModifier function
    const modifierContext = {
      scenario: { 
        encounterIntro: encounter.instructions || "",
        encounterInstructions: encounter.instructions || "",
        narrativeContext: turn.narrative || "",
      },
      rollRequirement: rollRequirementDetails,
      character: characterPerformingAction,
    };
    console.log('[processTurnReply] Modifier context being passed to getRollModifier:', JSON.stringify(modifierContext, null, 2));
    
    const calculatedModifier = await getRollModifier(modifierContext);
    console.log('[processTurnReply] Calculated modifier from getRollModifier:', calculatedModifier);
    
    // Override the modifier with the calculated one
    rollRequirementDetails.modifier = calculatedModifier;
    
    console.log('[processTurnReply] Final rollRequirementDetails with calculated modifier:', JSON.stringify(rollRequirementDetails, null, 2));
    
    // Set rollRequirement for the character, do not mark as complete
    const submitReplyArgs = {
      turnId,
      characterId,
      narrativeAction,
      rollRequirement: rollRequirementDetails, // Pass the details with calculated modifier
    };
    console.log('[processTurnReply] Convex mutation api.adventure.submitReply ARGS (roll required):', JSON.stringify(submitReplyArgs, null, 2));
    await convex.mutation(api.adventure.submitReply, submitReplyArgs)
    console.log('[processTurnReply] Convex mutation api.adventure.submitReply successful (roll required).');
    return { rollRequired: rollRequirementDetails }
  } else {
    console.log('[processTurnReply] Roll IS NOT required or rollRequirementDetails is malformed. Marking character complete.');
    // Mark character as complete and hasReplied
    const submitReplyArgs = {
      turnId,
      characterId,
      narrativeAction,
      rollRequirement: undefined,
    };
    console.log('[processTurnReply] Convex mutation api.adventure.submitReply ARGS (no roll):', JSON.stringify(submitReplyArgs, null, 2));
    await convex.mutation(api.adventure.submitReply, submitReplyArgs)
    console.log('[processTurnReply] Convex mutation api.adventure.submitReply successful (no roll).');
    // After marking player complete, process NPCs
    console.log('[processTurnReply] Processing NPC turns after player reply.');
    await processNpcTurnsAfterCurrent(turnId);
    console.log('[processTurnReply] NPC turn processing complete.');
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

  // Read the adventure plan to get the encounter title
  const plan = (await readJsonFromS3(`settings/${payload.settingId}/${payload.planId}.json`)) as AdventurePlan;
  if (!plan || !plan.sections) {
    throw new Error("Adventure plan not found or is invalid");
  }
  const firstEncounter = plan.sections
    .flatMap(section => section.scenes)
    .flatMap(scene => scene.encounters)
    .find(encounter => encounter.id === payload.turn.encounterId);

  if (!firstEncounter || !firstEncounter.title) {
    throw new Error(`First encounter (ID: ${payload.turn.encounterId}) not found in plan or is missing a title.`);
  }

  const turnWithTitle = {
    ...payload.turn,
    title: firstEncounter.title,
  };

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
    turn: turnWithTitle, // Pass the turn object with the title
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
  const planPath = `settings/${adventure.settingId}/${adventure.planId}.json`;
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan;
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

  let newNarrative = appendNarrative(turn.narrative || "", shortcode);
  
  const narrativeContext = (turn.narrative || "").split(/\n\n+/).slice(-2).join("\n\n");
  const rollOutcomePrompt = `
Context:
${narrativeContext}

Encounter Instructions:
${encounterInstructions}

Player action: "${shortcode}"

A dice roll was made for ${character.name}: ${rollType} (Result: ${totalResult}, Difficulty: ${difficulty}, Margin: ${margin}).

The margin indicates how close the roll was to the target number. Use this information to inspire the drama, tension, or impact of the outcome, but write a creative, immersive narrative that fits the context. Do not use game terms like "margin" or "DC" in the narrative.

Write a single, concise, immersive third-person PRESENT-tense narrative paragraph (exactly two sentences, max 60 words) describing the direct outcome of the roll. Focus on what the character perceives or the immediate result of their action (e.g., a lock clicking open, a rope snapping, information gained). If the roll was for perception, describe what is now sensed or known. **Do not narrate combat actions, damage, or status effects inflicted by other entities as part of this roll\'s outcome; these will be handled by subsequent game mechanics.** Only describe self-inflicted effects if the character\'s own roll was a critical failure of an action they were taking. Only reference things present in the context. Do not invent new objects, people, or events not implied by the context or encounter instructions. Write in third person PRESENT tense. Do not use lists, bullet points, or markdown formatting. Do not use semicolons. Never mention game mechanics, dice, or rules.

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
      id: turn._id,
      characters: turn.characters.map(c => ({
        ...c,
        healthPercent: typeof c.healthPercent === "number" ? c.healthPercent : 100,
      }) as TurnCharacter),
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

export async function getActiveAdventureForUser() {
  const { userId } = await auth()
  console.log("[getActiveAdventureForUser] userId:", userId)
  if (!userId) return null

  // Query for adventures where the user is a player and status is 'active' or 'waitingForPlayers'
  const activeAdventures = await convex.query(api.adventure.getAdventuresByPlayer, {
    playerId: userId,
    status: "active"
  })
  console.log("[getActiveAdventureForUser] activeAdventures:", JSON.stringify(activeAdventures, null, 2))
  const waitingAdventures = await convex.query(api.adventure.getAdventuresByPlayer, {
    playerId: userId,
    status: "waitingForPlayers"
  })
  console.log("[getActiveAdventureForUser] waitingAdventures:", JSON.stringify(waitingAdventures, null, 2))

  // Prioritize active, then waitingForPlayers
  const adventure = (activeAdventures && activeAdventures[0]) || (waitingAdventures && waitingAdventures[0])
  console.log("[getActiveAdventureForUser] selected adventure:", JSON.stringify(adventure, null, 2))
  if (!adventure) return null

  // Load the adventure plan for party info
  const planPath = `settings/${adventure.settingId}/${adventure.planId}.json`
  const adventurePlan = await readJsonFromS3(planPath) as AdventurePlan
  if (!adventurePlan) return null

  // Map players to full PC objects from adventure plan
  const party: PC[] = (adventure.players || []).map((player: { userId: string; characterId: string }) => {
    if (Array.isArray(adventurePlan.premadePlayerCharacters)) {
      const character = adventurePlan.premadePlayerCharacters.find((pc) => pc.id === player.characterId)
      if (character) {
        return { ...character, userId: player.userId }
      }
    }
    return null
  }).filter((char): char is PC => char !== null)

  // Return a shape compatible with Adventure type
  return {
    id: adventure._id,
    title: adventure.title,
    adventurePlanId: adventure.planId,
    settingId: adventure.settingId,
    status: adventure.status,
    party,
    turns: [],
    startedAt: adventure.startedAt ? new Date(adventure.startedAt).toISOString() : "",
    endedAt: adventure.endedAt ? new Date(adventure.endedAt).toISOString() : undefined,
    pausedAt: undefined,
  } as Adventure
} 