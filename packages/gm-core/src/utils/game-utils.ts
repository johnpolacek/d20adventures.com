import type { RollMode } from "../sheet/check"

export function mapConvexTurnToTurn(raw: unknown): import("../types/adventure").Turn | null {
  if (!raw || typeof raw !== "object" || !("encounterId" in raw) || !("title" in raw)) return null
  const t = raw as {
    _id: string
    encounterId: string
    title: string
    story: import("../story/beats").StoryBeat[]
    characters: import("../types/adventure").TurnCharacter[]
    adventureId: string
    isFinalEncounter?: boolean
  }
  return {
    id: t._id,
    encounterId: t.encounterId,
    title: t.title,
    story: t.story ?? [],
    characters: t.characters,
    adventureId: t.adventureId,
    isFinalEncounter: t.isFinalEncounter,
  }
}

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1
}

/** The d20s for a roll: the ones the roller sent, and any still missing rolled here. Advantage and Disadvantage take two. */
export function d20sFor(mode: RollMode, sent: readonly number[] = []): number[] {
  const dice = sent.slice(0, mode === "normal" ? 1 : 2)
  while (dice.length < (mode === "normal" ? 1 : 2)) dice.push(rollD20())
  return dice
}
