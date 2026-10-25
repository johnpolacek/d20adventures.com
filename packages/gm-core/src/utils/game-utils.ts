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
