import { createServerCore } from "@/lib/gm-server/core"

export async function markAdventureCompleteWithoutNextEncounter(...args: Parameters<ReturnType<typeof createServerCore>["markAdventureCompleteWithoutNextEncounter"]>) {
  return createServerCore().markAdventureCompleteWithoutNextEncounter(...args)
}

export async function persistTurnAndFinalizeAdventure(...args: Parameters<ReturnType<typeof createServerCore>["persistTurnAndFinalizeAdventure"]>) {
  return createServerCore().persistTurnAndFinalizeAdventure(...args)
}
