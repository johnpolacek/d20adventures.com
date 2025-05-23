"use server"
import { convex } from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { readJsonFromS3 } from "@/lib/s3-utils";
import { generateObject } from "@/lib/ai";
import { z } from "zod";
import type { Id } from "@/convex/_generated/dataModel";
import type { AdventurePlan } from "@/types/adventure-plan";
import type { Turn, TurnCharacter } from "@/types/adventure";
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service";
import { mapConvexTurnToTurn, rollD20 } from "@/lib/utils";
import wait from "waait"
import { appendNarrative } from "@/lib/services/narrative-service";

const encounterProgressionSchema = z.object({
  nextEncounterId: z.string(),
  narrative: z.string(),
});

// Type guard for characters with rollRequired and rollResult
function hasRollFields(
  c: TurnCharacter
): c is TurnCharacter & { rollRequired: { rollType: string; difficulty: number; modifier?: number }; rollResult: number } {
  return (
    "rollResult" in c &&
    typeof c.rollResult === "number" &&
    "rollRequired" in c &&
    typeof c.rollRequired === "object" &&
    c.rollRequired !== null
  );
}

export async function advanceTurn({ turnId, settingId, adventurePlanId }: { turnId: Id<"turns">; settingId: string; adventurePlanId: string }) {
  let shouldProcessNpcTurns = true; // Initialize to true by default
  // 1. Fetch the turn from Convex
  const turnData = await convex.query(api.adventure.getTurnById, { turnId });
  if (!turnData) throw new Error("Turn not found");
  const turn = mapConvexTurnToTurn({ ...turnData, adventureId: turnData.adventureId.toString() });
  if (!turn) throw new Error("Turn not found");

  // 2. Load the plan from S3
  console.log("[advanceTurn] settingId:", settingId, "adventurePlanId:", adventurePlanId);
  const plan = (await readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`)) as AdventurePlan;
  if (!plan || !plan.id || !plan.sections || !plan.title) {
    throw new Error("Adventure plan is missing required fields");
  }

  // 3. Find current encounter
  const findCurrentEncounter = (plan: AdventurePlan, currentEncounterId: string) =>
  plan.sections
    .flatMap(section => section.scenes)
    .flatMap(scene => scene.encounters)
    .find(encounter => encounter.id === currentEncounterId) ?? null;

  const currentEncounter = findCurrentEncounter(plan, turn.encounterId);
  if (!currentEncounter) throw new Error("Current encounter not found in plan");

  const encounterIntro = currentEncounter.intro ?? "";
  const encounterInstructions = currentEncounter.instructions ?? "";
  const narrativeContext = (turn.narrative ?? "")
    .split(/\n\n+/)
    .slice(-3)
    .join("\n\n");

  // Extract the player's most recent action from the narrative
  const mostRecentNarrativeBlock = (turn.narrative ?? "").split(/\n\n+/).filter(Boolean).at(-1) ?? "";

  // If a roll was made, extract the last roll result from the character(s)
  const lastRollingCharacter = (turn.characters as TurnCharacter[]).find(hasRollFields);
  let rollInfo = "";
  if (lastRollingCharacter) {
    const { name, rollRequired, rollResult } = lastRollingCharacter;
    const { rollType, difficulty, modifier = 0 } = rollRequired;
    const totalResult = rollResult;
    const success = totalResult >= difficulty;
    rollInfo = `Dice roll: ${rollType} ${totalResult} (difficulty: ${difficulty}, modifier: ${modifier}, success: ${success}) for ${name}`;
  }

  // Identify player characters
  const playerCharacters = (turn.characters as TurnCharacter[]).filter(c => c.type === 'pc');
  const playerCharacterNames = playerCharacters.map(c => c.name).join(", ");

  // 4. Ask LLM if encounter is resolved
  const transitionsText = currentEncounter.transitions
    ? (currentEncounter.transitions as { condition: string; encounter: string }[]).map(
        (t, i) =>
          `Transition ${i + 1} (id: ${t.encounter}):\n  Condition: ${t.condition}\n  Leads to: ${t.encounter}`
      ).join("\n")
    : "No explicit transitions for this encounter.";

  const prompt = `
Adventure Plan Overview:
${plan.overview}

Current Encounter Title: ${currentEncounter.title}
Current Encounter ID: ${currentEncounter.id}
Current Encounter Intro: ${encounterIntro}
Current Encounter Instructions: ${encounterInstructions}

Recent Narrative (last 3 paragraphs):
${narrativeContext}

Most recent action/event described in narrative:
${mostRecentNarrativeBlock}
${rollInfo ? "\n" + rollInfo : ""}

Available Transitions for this Encounter:
${transitionsText}

Your Task:
1. Evaluate if any transition condition from 'Available Transitions for this Encounter' is met based on the 'Recent Narrative' and 'Most recent action/event described in narrative'.
2. Determine the 'nextEncounterId'. If a transition condition IS met, use the ID from the met transition. If NO transition condition is met, the 'nextEncounterId' MUST be the Current Encounter ID ('${currentEncounter.id}').
3. Generate a 'narrative' response:
    - If transitioning: The narrative should describe the events that fulfill the transition condition and lead into the new encounter. This is a bridge.
    - If NOT transitioning (i.e., continuing the current encounter '${currentEncounter.id}'): The narrative should describe what happens next in the current encounter, continuing the scene based on the 'Most recent action/event described in narrative'.

IMPORTANT:
- Only use encounter IDs that exist in the 'Available Transitions for this Encounter' or the 'Current Encounter ID'.
- The 'narrative' you provide will be used to start the next turn. If transitioning, it will be followed by the new encounter's intro. If continuing, it will be the main narrative for the next phase of the current encounter.
- **Crucially, DO NOT write actions, dialogue, or internal thoughts for the player character(s) (e.g., ${playerCharacterNames}).** The narrative should describe NPC actions, environmental changes, or the direct consequences of the *player's* most recent action, setting the stage for the player's *next* decision.

Respond in JSON:
{
  "nextEncounterId": string, // ID of the next/current encounter
  "narrative": string      // Narrative for the transition OR for continuing the current encounter
}`;

  // Log the full prompt for debugging
  console.log("[advanceTurn] LLM prompt:\n" + prompt);

  await wait(1000);
  const llmResult = (await generateObject({ prompt, schema: encounterProgressionSchema })).object;

  // Log the LLM's raw response
  console.log("[advanceTurn] LLM result:", JSON.stringify(llmResult, null, 2));

  // Log what the LLM decided about encounter progression
  console.log("[advanceTurn] Next encounterId:", llmResult.nextEncounterId);

  // 6. Build the new turn object
  let newTurn: Turn | null = null;
  if (llmResult.nextEncounterId === turn.encounterId) {
    // Continue current encounter
    let newCharacters: TurnCharacter[] = (turn.characters as TurnCharacter[]).filter((c) => c.status !== "dead" && c.status !== "fled");
    const narrative = llmResult.narrative || ""; // Use LLM narrative
    // Reset hasReplied, isComplete, and re-roll initiative for all characters
    newCharacters = newCharacters.map((c) => ({
      ...c,
      hasReplied: false,
      isComplete: false,
      initiative: rollD20(), // Re-roll initiative
    }));

    // Sort by new initiative
    newCharacters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));

    newTurn = {
      id: "", // placeholder, Convex will generate
      adventureId: turnData.adventureId,
      encounterId: turn.encounterId,
      narrative,
      characters: newCharacters,
    };
  } else {
    // Transition to new encounter
    const nextEncounter = findCurrentEncounter(plan, llmResult.nextEncounterId);

    if (nextEncounter && nextEncounter.skipInitialNpcTurns) {
      console.log(`[advanceTurn] Skipping initial NPC turns for new encounter: ${nextEncounter.id}`);
      shouldProcessNpcTurns = false;
    }

    if (!nextEncounter) {
      await convex.mutation(api.turns.patchAdventure, { adventureId: turnData.adventureId, patch: { endedAt: Date.now(), updatedAt: Date.now() } });
      return { status: "adventure_complete" };
    }
    // PCs: persist from previous turn (remove dead/fled) and re-roll initiative
    const pcs: TurnCharacter[] = (turn.characters as TurnCharacter[])
      .filter((c) => c.type === "pc" && c.status !== "dead" && c.status !== "fled")
      .map((pc) => ({
        ...pc,
        initiative: rollD20(), // Re-roll PC initiative
      }));

    // NPCs: add from next encounter
    const npcs: TurnCharacter[] = (nextEncounter.npc || []).map((npcRef: { id: string }) => {
      const npc = plan.npcs[npcRef.id];
      return {
        ...npc,
        id: npcRef.id,
        type: "npc",
        isComplete: false,
        hasReplied: false,
        initiative: rollD20(),
      };
    });
    let allCharacters: TurnCharacter[] = [...pcs, ...npcs];
    // Reset hasReplied and isComplete for all characters
    allCharacters = allCharacters.map((c) => ({
      ...c,
      hasReplied: false,
      isComplete: false,
    }));
    // Sort by new initiative
    allCharacters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));

    // Use appendNarrative utility for new encounter intro and new narrative
    const narrative = appendNarrative(llmResult.narrative || "", nextEncounter.intro || "");
    newTurn = {
      id: "", // placeholder, Convex will generate
      adventureId: turnData.adventureId,
      encounterId: nextEncounter.id,
      narrative,
      characters: allCharacters, // Use the sorted and updated list
    };
  }

  // Determine if this new turn is for the final encounter
  const resolvedNextEncounterForFinalCheck = findCurrentEncounter(plan, newTurn.encounterId);
  const isFinalEncounter = resolvedNextEncounterForFinalCheck
    ? !resolvedNextEncounterForFinalCheck.transitions || resolvedNextEncounterForFinalCheck.transitions.length === 0
    : false;

  // 7. Create the new turn in Convex
  const newTurnId = await convex.mutation(api.turns.createTurn, {
    adventureId: turnData.adventureId,
    encounterId: newTurn.encounterId,
    narrative: newTurn.narrative,
    characters: newTurn.characters,
    order: (turnData.order || 0) + 1,
    isFinalEncounter: isFinalEncounter,
  });

  // 8. Patch adventure with new currentTurnId
  await convex.mutation(api.turns.patchAdventure, {
    adventureId: turnData.adventureId,
    patch: { currentTurnId: newTurnId },
  });

  // 9. After creating the new turn, process NPC turn if needed
  if (shouldProcessNpcTurns) {
    await processNpcTurnsAfterCurrent(newTurnId);
  } else {
    console.log(`[advanceTurn] NPC turns processing was skipped for turnId: ${newTurnId}`);
  }

  // 10. Return the new turn/adventure state
  return { status: "turn_advanced", turn: newTurn };
} 