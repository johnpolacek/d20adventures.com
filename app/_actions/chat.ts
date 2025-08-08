"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { convex, api } from "@/lib/convex/server";
import type { Id } from "@/convex/_generated/dataModel";

async function assertCanAccess(adventureId: Id<"adventures">, userId: string) {
  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId });
  if (!adventure) throw new Error("Not found");
  const isOwner = adventure.ownerId === userId;
  const isPlayer = Array.isArray(adventure.playerIds) && adventure.playerIds.includes(userId);
  if (!isOwner && !isPlayer) throw new Error("Unauthorized");
  return adventure;
}

export async function sendChatMessage(input: {
  adventureId: Id<"adventures">;
  content: string;
  characterName?: string;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  await assertCanAccess(input.adventureId, userId);
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const username = user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "Player";
  return convex.mutation(api.chat.postMessage, { ...input, username });
}

export async function fetchRecentMessages(adventureId: Id<"adventures">, limit = 50) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  await assertCanAccess(adventureId, userId);
  return convex.query(api.chat.getRecent, { adventureId, limit });
}


