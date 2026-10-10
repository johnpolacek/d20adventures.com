import type { RuntimeArtifacts, RuntimeManifest, RuntimeTransition } from "./types"

// Authored adventure rules the core enforces itself, because the model cannot be trusted to judge them:
// `playerDeath: false` keeps player characters alive, and `rescue` moves a badly hurt party to a rescue encounter.
export type SafetyRules = Pick<RuntimeManifest, "playerDeath">
type Health = { type: string; healthPercent?: number; status?: string }

export const MIN_PLAYER_HEALTH = 1
const NO_DEATH_NOTE =
  "Player characters cannot die in this adventure. A blow that would kill instead leaves a player character badly hurt, disarmed, pinned or reeling. Never describe a player character as dead or dying."

const isDead = (status?: string) => status?.trim().toLowerCase() === "dead"

/** With `playerDeath: false`, a player character keeps at least 1% health and never takes the status "dead". */
export function keepPlayersAlive<T extends Health>(rules: SafetyRules | undefined, characters: T[]): T[] {
  if (rules?.playerDeath !== false) return characters
  return characters.map((c) => {
    if (c.type !== "pc") return c
    const low = typeof c.healthPercent === "number" && c.healthPercent < MIN_PLAYER_HEALTH
    if (!low && !isDead(c.status)) return c
    return { ...c, healthPercent: low ? MIN_PLAYER_HEALTH : c.healthPercent, status: isDead(c.status) ? undefined : c.status }
  })
}

/** The same floor for the character updates a host applies from the model's advance patch. */
export function keepPatchedPlayersAlive<U extends { characterId: string; healthPercent?: number; status?: string }>(
  rules: SafetyRules | undefined,
  updates: U[],
  characters: Array<{ id: string; type: string }>
): U[] {
  if (rules?.playerDeath !== false) return updates
  const players = new Set(characters.filter((c) => c.type === "pc").map((c) => c.id))
  return updates.map((update) => {
    if (!players.has(update.characterId)) return update
    const safe = { ...update }
    if (typeof safe.healthPercent === "number" && safe.healthPercent < MIN_PLAYER_HEALTH) safe.healthPercent = MIN_PLAYER_HEALTH
    if (isDead(safe.status)) delete safe.status
    return safe
  })
}

/** Tells the GM what the floor above enforces, so its prose does not kill a character the state keeps alive. */
export function gmNotesWithRules(rules: SafetyRules | undefined, gmNotes?: string): string | undefined {
  return rules?.playerDeath === false ? [gmNotes, NO_DEATH_NOTE].filter(Boolean).join("\n\n") : gmNotes
}

/**
 * The rescue transition to take now: the adventure has a rescue it has not played yet, the current encounter authors
 * a transition to it, and a player character is at or below the threshold. The model never sees this transition.
 */
export function pendingRescue(args: {
  artifacts: Pick<RuntimeArtifacts, "manifest" | "graph">
  encounterId: string
  characters: Health[]
  playedEncounterIds: string[]
}): RuntimeTransition | undefined {
  const rescue = args.artifacts.manifest.rescue
  if (!rescue || args.encounterId === rescue.encounterId || args.playedEncounterIds.includes(rescue.encounterId)) return undefined
  if (!args.characters.some((c) => c.type === "pc" && c.status !== "fled" && (c.healthPercent ?? 100) <= rescue.atHealthPercent)) return undefined
  return args.artifacts.graph.encounterTransitions.find((t) => t.fromEncounterId === args.encounterId && t.toEncounterId === rescue.encounterId && t.publishResolved)
}
