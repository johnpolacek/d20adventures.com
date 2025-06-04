import { z } from "zod";
import { generateObject } from "@/lib/ai";
import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service";
import { getRollModifier, appendNarrative } from "@/lib/services/narrative-service";
import { rollD20 } from "@/lib/utils";
import type { Turn, TurnCharacter } from "@/types/adventure";
import { convex } from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { analyzeAndApplyDiceRoll } from "@/lib/services/turn-update-service";
import { readJsonFromS3 } from "@/lib/s3-utils";
import type { AdventurePlan, AdventureEncounter } from "@/types/adventure-plan";

// Step 1: Schema for LLM to decide NPC action
const npcActionSchema = z.object({
  actionSummary: z.string(), // e.g. "The goblin tries to sneak behind the hero and attack."
  narrative: z.string(), // Narrative update for the action
  effects: z.array(z.object({
    targetId: z.string(),
    equipmentToAdd: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
    })).optional(),
  })).optional(),
});

// Step 2: Schema for LLM to decide outcome of the action after roll
const npcActionOutcomeSchema = z.object({
  narrative: z.string(), // Narrative update for the outcome
  effects: z.array(z.object({
    targetId: z.string(),
    healthPercentDelta: z.number().optional(),
    status: z.string().optional(),
    equipmentToAdd: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
    })).optional(),
  })),
});

export async function processNpcTurnWithLLM({
  turn,
  npcId,
  encounterContext,
}: {
  turn: Turn;
  npcId: string;
  encounterContext?: { intro?: string; instructions?: string };
}): Promise<{
  updatedNarrative: string;
  updatedCharacters: TurnCharacter[];
  actionSummary: string;
  rollInfo?: { rollType: string; difficulty: number; baseRoll: number; modifier: number; result: number; success: boolean };
  effects?: Array<{ targetId: string; healthPercentDelta?: number; status?: string; equipmentToAdd?: Array<{name: string, description?: string}> }>;
  shortcode?: string;
  narrativeToAppend: string;
}> {
  // 1. LLM decides NPC action
  const npc = turn.characters.find((c) => c.id === npcId);
  if (!npc) throw new Error("NPC not found");
  const narrativeContext = (turn.narrative || "").split(/\n\n+/).slice(-2).join("\n\n");
  const playerCharactersForPrompt1 = turn.characters.filter(c => c.type === 'pc');
  const playerCharacterNamesForPrompt1 = playerCharactersForPrompt1.map(c => c.name);
  const prompt1 = `You are the DM for a tabletop RPG. Given the following context, decide what action the NPC should take this turn. Be creative and act as a real DM would. Output a short narrative for the action.
If the NPC's action involves giving items to a player character, include an "effects" array. Each object in "effects" should have a "targetId" (the ID of the character receiving items) and an "equipmentToAdd" array listing the items ({name: string, description?: string}).

Only include the NPC in the short narrative output: ${npc.name}
Targetable Player Characters: ${playerCharacterNamesForPrompt1.join(', ')} (IDs: ${playerCharactersForPrompt1.map(c => c.id).join(', ')})
${encounterContext?.intro ? `Encounter Intro: ${encounterContext.intro}\n` : ""}
${encounterContext?.instructions ? `Encounter Instructions: ${encounterContext.instructions}\n` : ""}
Recent Narrative:
${narrativeContext}

Respond as JSON:
{
  actionSummary: string,
  narrative: string,
  effects?: [ { targetId: string, equipmentToAdd?: [{name: string, description?: string}] } ]
}`;
  const actionResult = (await generateObject({ prompt: prompt1, schema: npcActionSchema })).object;

  let updatedNarrative = (turn.narrative || "");
  let narrativeToAppend = "";
  let updatedCharacters = [...turn.characters];
  let rollInfo = undefined;
  let effects: Array<{ targetId: string; healthPercentDelta?: number; status?: string; equipmentToAdd?: Array<{name: string, description?: string}> }> | undefined = undefined;
  let shortcode = undefined;

  // 2. Use roll requirement utility to determine if a roll is needed
  const rollRequirement = await getRollRequirementForAction(actionResult.actionSummary);
  if (rollRequirement && rollRequirement.rollType && rollRequirement.difficulty) {
    // 3. Get modifier
    const modifier = await getRollModifier({
      scenario: {
        encounterIntro: encounterContext?.intro || "",
        encounterInstructions: encounterContext?.instructions || "",
        narrativeContext: turn.narrative || "",
      },
      rollRequirement,
      character: npc,
    });
    // 4. Perform the roll
    const baseRoll = rollD20();
    const result = baseRoll + (modifier || 0);
    const success = result >= rollRequirement.difficulty;
    rollInfo = {
      rollType: rollRequirement.rollType,
      difficulty: rollRequirement.difficulty,
      baseRoll,
      modifier,
      result,
      success,
    };
    // 5. Build DiceRoll shortcode
    shortcode = `[DiceRoll:rollType=${rollRequirement.rollType};baseRoll=${baseRoll};modifier=${modifier >= 0 ? "+" + modifier : modifier};result=${result};difficulty=${rollRequirement.difficulty};character=${npc.name};image=${npc.image};success=${success}]\n`;
    // 6. LLM: Given the action, roll result, and context, generate the outcome
    const playerCharacters = turn.characters.filter(c => c.type === 'pc');
    const playerCharacterNames = playerCharacters.map(c => c.name);
    const prompt2 = `You are the DM for a tabletop RPG. Given the action, the dice roll result, and the context, write a short narrative describing the outcome. Focus the narrative on the interacting characters. **Do not narrate any actions or dialogue for player characters.** Then, output a JSON array of effects for any characters affected (targetId, healthPercentDelta, status). If the NPC\'s action results in any characters receiving items, specify these in an \`equipmentToAdd\` array (each item as \`{name: string, description?: string}\`) within the corresponding effect object for the target character.\n\nNPC: ${npc.name}\nPlayer Characters: ${playerCharacterNames.join(', ')}\nAction: ${actionResult.actionSummary}\nRoll Type: ${rollRequirement.rollType}\nRoll Result: ${result} (difficulty: ${rollRequirement.difficulty}, success: ${success})\n${encounterContext?.intro ? `Encounter Intro: ${encounterContext.intro}\n` : ""}${encounterContext?.instructions ? `Encounter Instructions: ${encounterContext.instructions}\n` : ""}Recent Narrative:\n${updatedNarrative}\n\nRespond as JSON:\n{\n  narrative: string,\n  effects: [ { targetId: string, healthPercentDelta?: number, status?: string, equipmentToAdd?: [{name: string, description?: string}] } ]\n}`;
    const outcomeResult = (await generateObject({ prompt: prompt2, schema: npcActionOutcomeSchema })).object;
    
    console.log("[NPC TURN] LLM-generated outcome result:", JSON.stringify(outcomeResult, null, 2));
    
    narrativeToAppend = (shortcode ? shortcode : "") + (outcomeResult.narrative || "");
    effects = outcomeResult.effects;
    
    console.log("[NPC TURN] Effects to apply:", JSON.stringify(effects, null, 2));
    
    // Log character health BEFORE applying effects
    console.log("[NPC TURN] Character health BEFORE applying effects:");
    updatedCharacters.forEach(c => {
      console.log(`  ${c.name} (${c.id}): ${c.healthPercent}%`);
    });
    
    // Apply effects to characters
    updatedCharacters = updatedCharacters.map((c) => {
      const effect = effects?.find((e) => e.targetId === c.id);
      const updated = { ...c };
      if (effect) {
        console.log(`[NPC TURN] Applying effect to ${c.name} (${c.id}):`, JSON.stringify(effect, null, 2));
        
        if (effect.healthPercentDelta !== undefined) {
          const oldHealth = c.healthPercent ?? 100;
          const newHealth = Math.max(0, oldHealth + effect.healthPercentDelta);
          updated.healthPercent = newHealth;
          console.log(`[NPC TURN] Health update for ${c.name}: ${oldHealth}% -> ${newHealth}% (delta: ${effect.healthPercentDelta})`);
        }
        
        updated.status = effect.status || c.status;
        if (effect.equipmentToAdd && effect.equipmentToAdd.length > 0) {
          const existingEquipment = Array.isArray(c.equipment) ? c.equipment : [];
          updated.equipment = [...existingEquipment, ...effect.equipmentToAdd];
          console.log(`[NPC TURN] Added equipment to ${c.name}:`, effect.equipmentToAdd);
        }
      }
      // Mark this NPC as having acted
      if (c.id === npc.id) {
        updated.hasReplied = true;
        updated.isComplete = true;
      }
      return updated;
    });
    
    // Log character health AFTER applying effects
    console.log("[NPC TURN] Character health AFTER applying effects:");
    updatedCharacters.forEach(c => {
      console.log(`  ${c.name} (${c.id}): ${c.healthPercent}%`);
    });
    
    // Logging for verification
    console.log("[NPC TURN] Roll required. Appending shortcode and outcome narrative...");

    // --- AI health update: analyzeAndApplyDiceRoll ---
    const diceRoll = {
      rollType: rollRequirement.rollType,
      baseRoll,
      modifier,
      result,
      difficulty: rollRequirement.difficulty,
      character: npc.name,
      // Try to infer the target from effects (first effect targetId)
      target: outcomeResult.effects && outcomeResult.effects[0] ? outcomeResult.effects[0].targetId : undefined,
      success,
    };
    
    console.log("[NPC TURN] Calling analyzeAndApplyDiceRoll with diceRoll:", JSON.stringify(diceRoll, null, 2));
    console.log("[NPC TURN] Character health BEFORE analyzeAndApplyDiceRoll:");
    updatedCharacters.forEach(c => {
      console.log(`  ${c.name} (${c.id}): ${c.healthPercent}%`);
    });
    
    const aiTurn = await analyzeAndApplyDiceRoll({
      turn: { ...turn, characters: updatedCharacters },
      diceRoll,
      narrative: appendNarrative(updatedNarrative, narrativeToAppend),
    });
    console.log("[NPC TURN] analyzeAndApplyDiceRoll result:", aiTurn.characters);
    
    // Log detailed comparison of AI updates
    console.log("[NPC TURN] Detailed AI character updates:");
    aiTurn.characters.forEach(aiChar => {
      const origChar = updatedCharacters.find(c => c.id === aiChar.id);
      if (origChar) {
        console.log(`  ${origChar.name} (${aiChar.id}):`);
        if (origChar.healthPercent !== aiChar.healthPercent) {
          console.log(`    Health: ${origChar.healthPercent}% -> ${aiChar.healthPercent}%`);
        }
        if (origChar.status !== aiChar.status) {
          console.log(`    Status: "${origChar.status}" -> "${aiChar.status}"`);
        }
      }
    });
    
    // Merge AI-updated fields into original TurnCharacter objects
    updatedCharacters = updatedCharacters.map(orig =>
      aiTurn.characters.find(ai => ai.id === orig.id)
        ? { ...orig, ...aiTurn.characters.find(ai => ai.id === orig.id) }
        : orig
    );
    
    // Log final character health state
    console.log("[NPC TURN] FINAL character health after AI merge:");
    updatedCharacters.forEach(c => {
      console.log(`  ${c.name} (${c.id}): ${c.healthPercent}%`);
    });
  } else {
    narrativeToAppend = actionResult.narrative;
    effects = actionResult.effects;

    updatedCharacters = updatedCharacters.map((c) => {
      const effect = effects?.find((e) => e.targetId === c.id);
      const updated = { ...c };
      if (effect) {
        if (effect.equipmentToAdd && effect.equipmentToAdd.length > 0) {
          const existingEquipment = Array.isArray(c.equipment) ? c.equipment : [];
          updated.equipment = [...existingEquipment, ...effect.equipmentToAdd];
        }
      }
      // Mark this NPC as having acted
      if (c.id === npc.id) {
        updated.hasReplied = true;
        updated.isComplete = true;
      }
      return updated;
    });
    // Logging for verification
    console.log("[NPC TURN] No roll required. Appending action narrative only:");
    console.log("[NPC TURN] Action narrative:", actionResult.narrative);
    if (effects && effects.length > 0) {
      console.log("[NPC TURN] Effects from no-roll action:", JSON.stringify(effects, null, 2));
    }
  }
  updatedNarrative = appendNarrative(updatedNarrative, narrativeToAppend);

  return {
    updatedNarrative,
    updatedCharacters,
    actionSummary: actionResult.actionSummary,
    rollInfo,
    effects,
    shortcode,
    narrativeToAppend,
  };
}

// Helper function to find encounter in plan
const findEncounterInPlan = (plan: AdventurePlan, encounterId: string): AdventureEncounter | null =>
  plan.sections
    .flatMap(section => section.scenes)
    .flatMap(scene => scene.encounters)
    .find(encounter => encounter.id === encounterId) ?? null;

export async function processNpcTurnsAfterCurrent(turnId: Id<"turns">) {
  let turn = await convex.query(api.adventure.getTurnById, { turnId });
  if (!turn) throw new Error("Turn not found");

  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: turn.adventureId });
  if (!adventure) throw new Error(`Adventure not found for ID: ${turn.adventureId.toString()}`);

  const plan = (await readJsonFromS3(`settings/${adventure.settingId}/${adventure.planId}.json`)) as AdventurePlan;
  if (!plan || !plan.id || !plan.sections || !plan.title) {
    throw new Error("Adventure plan is missing required fields or could not be loaded");
  }

  let characters = turn.characters as TurnCharacter[];
  // Take a snapshot of the current initiative order
  const initiativeOrder = characters
    .filter((c) => !c.hasReplied && !c.isComplete)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));

  for (const char of initiativeOrder) {
    if (char.type !== "npc") break; // Process NPCs in order, then stop

    // Always reload the latest turn state before processing each NPC
    // as previous NPC actions in the same turn might have updated it.
    const currentTurnState = await convex.query(api.adventure.getTurnById, { turnId });
    if (!currentTurnState) {
      console.warn("[NPC TURN] Could not reload turn state, stopping NPC processing for this turn.");
      break;
    }
    turn = currentTurnState; // Update local turn variable
    characters = turn.characters as TurnCharacter[]; // Update local characters variable

    const npc = characters.find((c) => c.id === char.id && c.type === "npc" && !c.hasReplied && !c.isComplete);
    if (!npc) continue; // NPC already processed or no longer eligible

    const currentEncounterDetails = findEncounterInPlan(plan, turn.encounterId);
    let encounterContext: { intro?: string; instructions?: string } = {};
    if (currentEncounterDetails) {
      encounterContext = {
        intro: currentEncounterDetails.intro,
        instructions: currentEncounterDetails.instructions,
      };
    } else {
      console.warn(`[NPC TURN] Could not find details for encounter ${turn.encounterId} in the plan.`);
    }

    const result = await processNpcTurnWithLLM({
      turn: { ...turn, id: turn._id, characters }, // Pass the reloaded turn characters
      npcId: npc.id,
      encounterContext, // Pass the populated context
    });
    // Use appendNarrative utility for consistent narrative updates
    const newNarrative = appendNarrative(turn.narrative || "", result.narrativeToAppend || "");
    
    await convex.mutation(api.turns.updateTurn, {
      turnId: turn._id,
      patch: {
        characters: result.updatedCharacters,
        narrative: newNarrative,
        updatedAt: Date.now(),
      },
    });
  }
} 