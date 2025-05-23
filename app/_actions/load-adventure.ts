'use server'
import { api } from "@/convex/_generated/api";
import { convex } from "@/lib/convex/server";
import { auth } from "@clerk/nextjs/server";
import type { Id } from "@/convex/_generated/dataModel";

export async function loadAdventureWithNpc(adventureId: Id<"adventures">, refreshKey?: number) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return convex.mutation(api.adventure.getCurrentAdventureWithNpcProcessing, { adventureId, refreshKey });
} 