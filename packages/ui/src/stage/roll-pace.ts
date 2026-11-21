// How fast a roll plays. The roll that opens an encounter plays in full, and the ones after it are quick.

export type RollPace = "full" | "quick"

// The roll that opened each encounter, so the same roll shown again keeps its pace.
const opened = new Map<string, string>()

/** The pace of the roll `roll` in `encounter`. Each is a key of the caller's own. */
export function rollPace(encounter: string, roll: string): RollPace {
  if (!opened.has(encounter)) opened.set(encounter, roll)
  return opened.get(encounter) === roll ? "full" : "quick"
}
