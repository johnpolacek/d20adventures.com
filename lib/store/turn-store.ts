import { create } from "zustand";
import type { Turn, TurnCharacter } from "@/types/adventure";
import { generateNarrativeUpdate, ensureNarrativeAction, isRedundantOrMinimalAction, ensureNarrativeActionWithContext, generateRollOutcomeNarrativeWithContext } from "@/lib/services/narrative-service";
import type { AdventurePlan } from "@/types/adventure-plan";

// Helper: call backend AI for roll requirement
async function getRollRequired(reply: string) {
  const res = await fetch("/api/ai/get-roll-requirement", {
    method: "POST",
    body: JSON.stringify({ reply }),
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  return data.rollRequirement ?? null;
}

type RollState = {
  rollType: string;
  difficulty: number;
} | null;

type TurnCharacterWithRoll = TurnCharacter & {
  rollRequired?: RollState;
  rollResult?: number | null;
};

type TurnState = {
  currentTurn: (Omit<Turn, "characters"> & { characters: TurnCharacterWithRoll[] }) | null;
  setCurrentTurn: (turn: Turn) => void;
  updateNarrative: (narrative: string, characterId: string) => void;
  submitReply: (characterId: string, reply: string) => void;
  rollForCharacter: (characterId: string, result: number) => void;
};

export const useTurnStore = create<TurnState>((set) => ({
  currentTurn: null,
  setCurrentTurn: (turn) => set({ currentTurn: { ...turn, characters: turn.characters.map(c => ({ ...c })) } }),
  updateNarrative: (narrative, characterId) =>
    set((state) => {
      if (!state.currentTurn) return {};
      const prev = state.currentTurn.narrative || "";
      const next = prev ? `${prev}\n\n${narrative}` : narrative;
      const updatedCharacters = state.currentTurn.characters.map((c) =>
        c.id === characterId ? { ...c, hasReplied: true } : c
      );
      return {
        currentTurn: {
          ...state.currentTurn,
          narrative: next,
          characters: updatedCharacters,
        },
      };
    }),
  submitReply: async (characterId, reply) => {
    const rollRequired = await getRollRequired(reply);
    const state = useTurnStore.getState();
    const currentTurn = state.currentTurn;
    const character = currentTurn?.characters.find((c) => c.id === characterId);
    let narrativeAction = reply;
    let encounterIntro = "";
    let encounterInstructions = "";
    let narrativeContext = "";
    if (currentTurn) {
      // Use last 2 paragraphs of narrative as context
      const paragraphs = (currentTurn.narrative || "").split(/\n\n+/).filter(Boolean);
      narrativeContext = paragraphs.slice(-2).join("\n\n");
      // Fetch encounter context
      try {
        const res = await fetch("/api/ai/get-encounter-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ encounterId: currentTurn.encounterId }),
        });
        if (res.ok) {
          const data = await res.json();
          encounterIntro = data.intro || "";
          encounterInstructions = data.instructions || "";
          console.log("[submitReply] Encounter context:", { encounterIntro, encounterInstructions });
        } else {
          console.log("[submitReply] Failed to fetch encounter context", res.status);
        }
      } catch (err) {
        console.log("[submitReply] Error fetching encounter context", err);
      }
    }
    if (character) {
      if (encounterIntro || encounterInstructions) {
        narrativeAction = await ensureNarrativeActionWithContext({
          characterName: character.name,
          playerInput: reply,
          narrativeContext,
          encounterIntro,
          encounterInstructions,
        });
      } else {
        narrativeAction = await ensureNarrativeAction(character.name, reply);
      }
    }
    let aiNarrative = null;
    let prev = currentTurn?.narrative || "";
    let isRedundant = false;
    // Only check redundancy and generate narrative if no roll is required
    if (!rollRequired && character) {
      aiNarrative = await generateNarrativeUpdate(prev, narrativeAction);
      isRedundant = aiNarrative
        ? await isRedundantOrMinimalAction(narrativeAction, aiNarrative, character.name)
        : false;
    }
    // Debug logging
    console.log("[submitReply] prev narrative:", JSON.stringify(prev, null, 2));
    console.log("[submitReply] original reply:", JSON.stringify(reply, null, 2));
    console.log("[submitReply] narrativeAction:", JSON.stringify(narrativeAction, null, 2));
    console.log("[submitReply] aiNarrative:", JSON.stringify(aiNarrative, null, 2));
    console.log("[submitReply] isRedundantOrMinimalAction:", JSON.stringify(isRedundant, null, 2));
    set((state) => {
      if (!state.currentTurn) return {};
      const prev = state.currentTurn.narrative || "";
      let narrative = prev;
      // Always append the action (unless redundant and no roll is required)
      if (!rollRequired || (rollRequired && narrativeAction)) {
        // If no roll is required, skip redundant actions
        if (!rollRequired && isRedundant) {
          // Do not append action
        } else {
          narrative = prev ? `${prev}\n\n${narrativeAction}` : narrativeAction;
        }
      }
      // If no roll is required, append the AI narrative continuation
      if (!rollRequired && aiNarrative) {
        narrative = `${narrative}\n\n${aiNarrative}`;
      }
      console.log("[submitReply] FINAL narrative:", JSON.stringify(narrative, null, 2));
      const updatedCharacters = state.currentTurn.characters.map((c) =>
        c.id === characterId
          ? {
              ...c,
              hasReplied: true,
              rollRequired,
              rollResult: null,
              ...(rollRequired ? {} : { isComplete: true }),
            }
          : c
      );
      return {
        currentTurn: {
          ...state.currentTurn,
          narrative,
          characters: updatedCharacters,
        },
      };
    });
  },
  rollForCharacter: async (characterId, result) => {
    const state = useTurnStore.getState();
    console.log("[rollForCharacter] called with", JSON.stringify({ characterId, result, state }, null, 2));
    if (!state.currentTurn) {
      console.log("[rollForCharacter] No currentTurn");
      return;
    }
    const character = state.currentTurn.characters.find((c) => c.id === characterId);
    if (!character) {
      console.log("[rollForCharacter] No character found for id", characterId);
      return;
    }
    if (!character.rollRequired) {
      console.log("[rollForCharacter] No rollRequired for character", characterId);
      return;
    }
    const success = result >= character.rollRequired.difficulty;
    // Build the shortcode
    const shortcode = `[DiceRoll:rollType=${character.rollRequired.rollType};result=${result};difficulty=${character.rollRequired.difficulty};character=${character.name};image=${character.image};success=${success}]
`;
    // Prepare context for AI
    let prev = state.currentTurn.narrative || "";
    let encounterIntro = "";
    let encounterInstructions = "";
    let narrativeContext = "";
    let playerAction = "";
    // Use last 2 paragraphs of narrative as context
    const paragraphs = (prev || "").split(/\n\n+/).filter(Boolean);
    narrativeContext = paragraphs.slice(-2).join("\n\n");
    // Try to find the last action for this character (last reply appended)
    // For now, just use the last paragraph if it contains the character's name
    const lastPara = paragraphs[paragraphs.length - 1] || "";
    if (lastPara.includes(character.name)) playerAction = lastPara;
    // Fetch encounter context
    try {
      const res = await fetch("/api/ai/get-encounter-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encounterId: state.currentTurn.encounterId }),
      });
      if (res.ok) {
        const data = await res.json();
        encounterIntro = data.intro || "";
        encounterInstructions = data.instructions || "";
        console.log("[rollForCharacter] Encounter context:", { encounterIntro, encounterInstructions });
      } else {
        console.log("[rollForCharacter] Failed to fetch encounter context", res.status);
      }
    } catch (err) {
      console.log("[rollForCharacter] Error fetching encounter context", err);
    }
    // Generate AI outcome narrative
    let aiOutcomeNarrative = "";
    try {
      aiOutcomeNarrative = await generateRollOutcomeNarrativeWithContext({
        characterName: character.name,
        rollType: character.rollRequired.rollType,
        rollResult: result,
        rollDifficulty: character.rollRequired.difficulty,
        rollSuccess: success,
        narrativeContext,
        encounterIntro,
        encounterInstructions,
        playerAction,
      });
    } catch (err) {
      console.log("[rollForCharacter] Error generating AI outcome narrative", err);
    }
    // Insert all narrative pieces
    let newNarrative = prev;
    if (prev.trim() === "") {
      newNarrative = `${shortcode}`;
      if (aiOutcomeNarrative) newNarrative += `\n\n${aiOutcomeNarrative}`;
    } else {
      const lines = prev.split(/\n+/);
      let insertIdx = lines.length;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() !== "") {
          insertIdx = i + 1;
          break;
        }
      }
      lines.splice(insertIdx, 0, shortcode);
      if (aiOutcomeNarrative) lines.splice(insertIdx + 1, 0, aiOutcomeNarrative);
      newNarrative = lines.join("\n");
    }
    const updatedCharacters = state.currentTurn.characters.map((c) =>
      c.id === characterId
        ? {
            ...c,
            rollResult: result,
            isComplete: true,
          }
        : c
    );
    console.log("[rollForCharacter] FINAL narrative:", newNarrative);
    set({
      currentTurn: {
        ...state.currentTurn,
        narrative: newNarrative,
        characters: updatedCharacters,
      },
    });
  },
}));

// Derived selector: isTurnComplete
export function useIsTurnComplete() {
  return useTurnStore((state) => {
    const turn = state.currentTurn;
    if (!turn) return false;
    return turn.characters.every((c) => c.isComplete);
  });
}

// Advance to next turn (basic demo version)
export async function advanceToNextTurn(adventurePlan: AdventurePlan, currentTurn: Turn) {
  // Find the current encounter in the plan
  let foundEncounter = null;
  for (const section of adventurePlan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        if (encounter.id === currentTurn.encounterId) {
          foundEncounter = encounter;
          break;
        }
      }
      if (foundEncounter) break;
    }
    if (foundEncounter) break;
  }
  if (!foundEncounter) {
    console.log("[advanceToNextTurn] Current encounter not found");
    return;
  }
  const nextId = foundEncounter.transitions?.[0]?.encounter;
  if (!nextId) {
    console.log("[advanceToNextTurn] No next encounter in transitions");
    return;
  }
  // Find the next encounter
  let nextEncounter = null;
  for (const section of adventurePlan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        if (encounter.id === nextId) {
          nextEncounter = encounter;
          break;
        }
      }
      if (nextEncounter) break;
    }
    if (nextEncounter) break;
  }
  if (!nextEncounter) {
    console.log("[advanceToNextTurn] Next encounter not found");
    return;
  }
  // Build new turn (for demo, just copy party from currentTurn)
  let newCharacters = currentTurn.characters.map((c) => ({
    ...c,
    hasReplied: false,
    isComplete: false,
    rollRequired: undefined,
    rollResult: undefined,
    initiative: rollD20(),
  }));
  // Add NPCs if present in the encounter, avoiding duplicates
  if (nextEncounter.npc && Array.isArray(nextEncounter.npc)) {
    for (const npcRef of nextEncounter.npc) {
      const npcData = adventurePlan.npcs?.[npcRef.id];
      const alreadyPresent = newCharacters.some((c) => c.id === npcRef.id && c.type === "npc");
      if (npcData && !alreadyPresent) {
        newCharacters.push({
          ...npcData,
          id: npcRef.id,
          type: "npc",
          initiative: rollD20(),
          hasReplied: false,
          isComplete: false,
          rollRequired: undefined,
          rollResult: undefined,
        });
      }
    }
  }
  const newTurn = {
    encounterId: nextEncounter.id,
    title: nextEncounter.title,
    subtitle: nextEncounter.title,
    narrative: nextEncounter.intro || "",
    characters: newCharacters,
  };
  useTurnStore.getState().setCurrentTurn(newTurn);
  console.log("[advanceToNextTurn] Advanced to encounter:", nextEncounter.id);
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
} 