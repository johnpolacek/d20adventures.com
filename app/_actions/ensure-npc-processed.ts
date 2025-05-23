'use server';

import { auth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service";

export async function ensureNpcProcessed(turnId: Id<"turns">): Promise<{ status: string }> {
  const { userId } = await auth();
  if (!userId) {
    console.error('[ensureNpcProcessed] Unauthorized access attempt.');
    throw new Error("Unauthorized");
  }

  console.log(`[ensureNpcProcessed] Checking turn ${turnId} for pending NPC actions.`);
  const turn = await convex.query(api.adventure.getTurnById, { turnId });

  if (!turn) {
    console.error(`[ensureNpcProcessed] Turn ${turnId} not found.`);
    return { status: "error_turn_not_found" };
  }

  const characters = turn.characters || [];
  // Sort by initiative (highest first) to find the current actor
  const sortedCharacters = [...characters].sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
  const currentActor = sortedCharacters.find(c => !c.isComplete);

  if (currentActor && currentActor.type === "npc" && !currentActor.hasReplied) {
    console.log(`[ensureNpcProcessed] Pending NPC ${currentActor.id} found in turn ${turnId}. Processing...`);
    try {
      await processNpcTurnsAfterCurrent(turnId);
      console.log(`[ensureNpcProcessed] Finished processing NPCs for turn ${turnId}.`);
      return { status: "npc_processing_triggered" };
    } catch (error) {
      console.error(`[ensureNpcProcessed] Error during processNpcTurnsAfterCurrent for turn ${turnId}:`, error);
      return { status: "error_processing_npc" };
    }
  } else {
    console.log(`[ensureNpcProcessed] No pending NPC actions found for turn ${turnId}, or current actor is not an NPC awaiting reply.`);
    return { status: "no_pending_npc" };
  }
} 