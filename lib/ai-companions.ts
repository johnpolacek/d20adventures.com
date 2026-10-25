// Helpers for AI companion entries on adventure.players. All reads/writes of
// the controlledBy marker on player entries go through this module so the
// field name lives in one place.

export type AdventurePlayerEntry = {
  userId: string
  characterId: string
  controlledBy?: "ai"
}

export function markAiControlled(entry: { userId: string; characterId: string }): AdventurePlayerEntry {
  return { ...entry, controlledBy: "ai" }
}

export function isAiControlled(entry: AdventurePlayerEntry): boolean {
  return entry.controlledBy === "ai"
}

// Player entries store S3 keys like "characters/<userId>/<sheetId>.json" while
// party PCs carry the bare sheet id; strip the key down for matching.
export function characterIdFromPlayerKey(characterId: string): string {
  const tail = characterId.split("/").pop() ?? characterId
  return tail.endsWith(".json") ? tail.slice(0, -".json".length) : tail
}

export function getAiControlledCharacterIds(players: AdventurePlayerEntry[] | undefined): Set<string> {
  return new Set((players ?? []).filter(isAiControlled).map((p) => characterIdFromPlayerKey(p.characterId)))
}
