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
  const narrativeContext = (turn.narrative ?? "");

  // Extract the player's most recent action from the narrative
  const mostRecentNarrativeBlock = (turn.narrative ?? "").split(/\n\n/).filter(Boolean).at(-1) ?? "";

  // Try to parse the last DiceRoll from the narrative to construct rollInfo
  const diceRollRegex = /\[DiceRoll:([^\]]+)\]/g;
  const narrativeForRollParsing = turn.narrative ?? "";
  let matches;
  let lastDiceRollParamsStr: string | null = null;
  while ((matches = diceRollRegex.exec(narrativeForRollParsing)) !== null) {
    lastDiceRollParamsStr = matches[1];
  }

  let rollInfo = "No character-specific dice roll was identified as the immediate precursor to this state."; // Default

  if (lastDiceRollParamsStr) {
    const params = lastDiceRollParamsStr.split(';').reduce((acc, part) => {
      const [key, ...valueParts] = part.split('=');
      const value = valueParts.join('=');
      if (key && value !== undefined) acc[key.trim()] = value.trim();
      return acc;
    }, {} as Record<string, string>);

    const characterName = params.character;
    const rollType = params.rollType;
    const resultStr = params.result;
    const difficultyStr = params.difficulty;
    const successStr = params.success;
    const modifierStr = params.modifier;

    if (characterName && rollType && resultStr && difficultyStr && successStr) {
      const rollResult = parseInt(resultStr, 10);
      const difficulty = parseInt(difficultyStr, 10);
      const success = successStr === 'true';
      let modifier: number | undefined = undefined;
      let modifierText = "";

      if (modifierStr) {
          const parsedModifier = parseInt(modifierStr, 10);
          if (!isNaN(parsedModifier)) {
              modifier = parsedModifier;
              modifierText = `, modifier: ${modifier}`;
          }
      }

      if (!isNaN(rollResult) && !isNaN(difficulty)) {
        rollInfo = `Regarding the most recent dice roll: Character '${characterName}' attempted a '${rollType}'. The result was ${rollResult} (difficulty: ${difficulty}${modifierText}). This roll was a ${success ? 'SUCCESS' : 'FAILURE'}.`;
        console.log("[advanceTurn] Constructed rollInfo from parsed narrative:", rollInfo);
      } else {
        console.log("[advanceTurn] Failed to parse numeric rollResult/difficulty from DiceRoll tag. Parsed params:", JSON.stringify(params));
      }
    } else {
      console.log("[advanceTurn] Could not parse all required fields (character, rollType, result, difficulty, success) from DiceRoll tag. Parsed params:", JSON.stringify(params));
    }
  } else {
    console.log("[advanceTurn] No DiceRoll tag found in narrative. Attempting fallback to character object data for rollInfo.");
    const lastRollingCharacter = (turn.characters as TurnCharacter[]).find(hasRollFields);
    if (lastRollingCharacter) {
      const { name, rollRequired, rollResult: charRollResult } = lastRollingCharacter;
      const { rollType: charRollType, difficulty: charDifficulty, modifier: charModifier = 0 } = rollRequired;
      const charSuccess = charRollResult >= charDifficulty;
      rollInfo = `Regarding the most recent dice roll (from character data): Character '${name}' attempted a '${charRollType}'. The result was ${charRollResult} (difficulty: ${charDifficulty}, modifier: ${charModifier}). This roll was a ${charSuccess ? 'SUCCESS' : 'FAILURE'}.`;
      console.log("[advanceTurn] Constructed rollInfo from character data (fallback):", rollInfo);
    } else {
      console.log("[advanceTurn] No specific roll found in character data either (fallback). Using default message for rollInfo.");
    }
  }

  // Identify player characters
  const playerCharacters = (turn.characters as TurnCharacter[]).filter(c => c.type === 'pc');
  const playerCharacterNames = playerCharacters.map(c => c.name).join(", ");

  // 4. Ask LLM if encounter is resolved
  const transitionsText = currentEncounter.transitions
    ? (currentEncounter.transitions as { condition: string; encounter: string }[]).map(
        (t, i) =>
          `Transition Option ${i + 1} (leads to encounter ID: '${t.encounter}'):\n  Condition to check: ${t.condition}`
      ).join("\n")
    : "No explicit transitions defined for this encounter.";

  // Find current section and scene for context
  let currentSection = undefined;
  let currentScene = undefined;
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      if (scene.encounters.some(enc => enc.id === turn.encounterId)) {
        currentSection = section;
        currentScene = scene;
        break;
      }
    }
    if (currentSection && currentScene) break;
  }

  const sectionContext = currentSection ? `Section Title: ${currentSection.title || ""}\nSection Summary: ${currentSection.summary || ""}` : "";
  const sceneContext = currentScene ? `Scene Title: ${currentScene.title || ""}\nScene Summary: ${currentScene.summary || ""}` : "";
  const adventureOverview = plan.overview ? `Adventure Overview: ${plan.overview}` : "";

  // --- DETAILED LOGGING FOR LLM PROMPT INPUTS ---
  console.log("\n[advanceTurn] --- LLM PROMPT INPUTS ---");
  console.log("[advanceTurn] Adventure Overview:", plan.overview);
  if (currentSection) {
    console.log("[advanceTurn] Section Title:", currentSection.title);
    console.log("[advanceTurn] Section Summary:", currentSection.summary);
  }
  if (currentScene) {
    console.log("[advanceTurn] Scene Title:", currentScene.title);
    console.log("[advanceTurn] Scene Summary:", currentScene.summary);
  }
  console.log("[advanceTurn] Current Encounter Title:", currentEncounter.title);
  console.log("[advanceTurn] Current Encounter ID:", currentEncounter.id);
  console.log("[advanceTurn] Current Encounter Intro:", encounterIntro);
  console.log("[advanceTurn] Current Encounter Instructions:", encounterInstructions);
  console.log("[advanceTurn] Recent Narrative (context):\n", narrativeContext);
  console.log("[advanceTurn] Most Recent Narrative Block (action/event):\n", mostRecentNarrativeBlock);
  console.log("[advanceTurn] Roll Information For Context:", rollInfo);
  console.log("[advanceTurn] Available Transitions Text:\n", transitionsText);
  console.log("[advanceTurn] Player Character Names:", playerCharacterNames);
  console.log("--- END LLM PROMPT INPUTS ---\n");
  // --- END DETAILED LOGGING ---

  const prompt = `
${adventureOverview}

${sectionContext}

${sceneContext}

Current Encounter Title: ${currentEncounter.title}
Current Encounter ID: ${currentEncounter.id}
Current Encounter Intro:
${encounterIntro}
Current Encounter Instructions:
${encounterInstructions}

Recent Narrative Context (last few paragraphs):
${narrativeContext}

Most Recent Action/Event from the narrative (this is what the player/environment JUST DID):
${mostRecentNarrativeBlock}

${rollInfo ? `Key Information Regarding Recent Dice Roll (related to the 'Most Recent Action/Event'):
${rollInfo}
` : 'No specific dice roll outcome to report for the most recent action.'}
Available Transition Options for '${currentEncounter.id}':
${transitionsText}

Your Task:
1. Carefully review the 'Recent Narrative Context', the 'Most Recent Action/Event', and any 'Key Information Regarding Recent Dice Roll'. These describe events that HAVE ALREADY HAPPENED.
2. Evaluate 'Most Recent Action/Event' against 'Available Transition Options' (if any):
    - If a transition condition IS clearly met by PAST actions/rolls: Set 'nextEncounterId' to the 'encounter' ID specified in that transition option. The 'Available Transition Options' list is the definitive guide for all transitions. If the 'Most Recent Action/Event' directly and clearly fulfills a 'condition' in this list, that transition MUST occur. This takes strict precedence over any general interaction possibilities mentioned in the 'Current Encounter Instructions'.
3. Determine the 'nextEncounterId':
    - If a transition condition IS MET: Use the 'leads to encounter ID' from that transition.
    - If MULTIPLE transition conditions appear to be met by PAST actions/rolls: Prioritize conditions related to explicit success or failure of a recent dice roll if applicable. If still ambiguous, use the first one that clearly applies.
    - If NO transition condition is met the 'nextEncounterId' should remain the Current Encounter ID ('${currentEncounter.id}').
4. Generate a 'narrative' response:
    - If transitioning (because a condition was met by PAST actions/rolls): The narrative should briefly describe the events or state that fulfill the transition condition and logically lead into the new encounter. This acts as a bridge.
    - If NOT transitioning (i.e., 'nextEncounterId' is '${currentEncounter.id}'): The narrative MUST describe what happens next in the current encounter based on the 'Most Recent Action/Event' and 'Key Information Regarding Recent Dice Roll'. It should set the stage for the player's NEXT decision. For example, if a creature was detected, the narrative might describe the creature appearing or its immediate reaction, prompting the player to decide their next move. DO NOT write new actions or decisions for the player character(s).
    - Do NOT add any questions at the end like 'What does he do next?'
    - Do NOT mention any game mechanics such as dice rolls.

IMPORTANT GUIDELINES:
- Only use encounter IDs explicitly listed in the 'Available Transition Options' or the 'Current Encounter ID' ('${currentEncounter.id}').
- Your 'narrative' response will set the stage for the player's NEXT turn.
- **CRITICAL REMINDER: DO NOT write new actions, dialogue, choices, or internal thoughts for the player character(s) (e.g., ${playerCharacterNames}).** The narrative must describe NPC actions, environmental changes, or the direct, immediate consequences of the player's PAST action/roll. The goal is to prepare for the player's *next actual decision*, not to make it for them.
- If a transition occurs due to a failed dice roll (that already happened), ensure the narrative reflects the consequences of that failure leading to the new situation.
- If a transition occurs due to a successful dice roll (that already happened), ensure the narrative reflects the consequences of that success.
- If no transition occurs, the narrative should clearly end in a way that prompts the player for their next action. For instance, describe the scene and end with a question like "What does Thalbern do next?" or simply describe the immediate situation that demands a response.

Respond in JSON:
{
  "nextEncounterId": string, // ID of the next/current encounter based on your evaluation
  "narrative": string      // Narrative prose for the transition OR for continuing the current encounter. IMPORTANT: Do NOT include any questions at the end such as 'What does [character name] do next?' and do NOT mention any game mechanics such as dice rolls.
}
`;

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
      title: currentEncounter.title,
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
    let pcs: TurnCharacter[] = (turn.characters as TurnCharacter[])
      .filter((c) => c.type === "pc" && c.status !== "dead" && c.status !== "fled")
      .map((pc) => ({
        ...pc,
        initiative: rollD20(), // Re-roll PC initiative
      }));

    // Reset health if the encounter has resetHealth flag
    if (nextEncounter.resetHealth) {
      console.log(`[advanceTurn] Resetting health for all characters due to resetHealth flag in encounter: ${nextEncounter.id}`);
      pcs = pcs.map((pc) => ({
        ...pc,
        healthPercent: 100,
        status: pc.status === "dead" ? "" : pc.status, // Clear dead status if health is being reset
      }));
    }

    // NPCs: add from next encounter
    const npcs: TurnCharacter[] = (nextEncounter.npc || []).map((npcRef: { id: string; initialInitiative?: number }) => {
      const npc = plan.npcs[npcRef.id];
      return {
        ...npc,
        id: npcRef.id,
        type: "npc",
        isComplete: false,
        hasReplied: false,
        initiative: typeof npcRef.initialInitiative === 'number' ? npcRef.initialInitiative : rollD20(),
        // NPCs always start at full health
        healthPercent: 100,
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
      title: nextEncounter.title,
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
    title: newTurn.title,
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