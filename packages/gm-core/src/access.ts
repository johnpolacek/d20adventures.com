import type { AdventureRecord, GmPorts, TurnRecord } from "./ports"

type AdventureDoc = AdventureRecord

type TurnDoc = TurnRecord

type TurnCharacter = TurnDoc["characters"][number]

export class AdventureAccessError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = "AdventureAccessError"
  }
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new AdventureAccessError(401, "Unauthorized")
  }
  return userId
}

function userCanAccessAdventure(userId: string, adventure: AdventureDoc): boolean {
  if ((adventure.runType ?? "campaign") === "practice") {
    return adventure.ownerId === userId
  }
  return adventure.ownerId === userId || (Array.isArray(adventure.playerIds) && adventure.playerIds.includes(userId))
}

export function assertPlayerCharacterControl(userId: string | null | undefined, turn: TurnDoc, characterId: string): TurnCharacter {
  const resolvedUserId = requireUserId(userId)
  const character = turn.characters.find((c) => c.id === characterId)
  if (!character) {
    throw new AdventureAccessError(404, "Character not found")
  }
  if (character.type !== "pc") {
    throw new AdventureAccessError(403, "Only player characters can perform this action")
  }
  // AI companions carry the owner's userId, so this must come before the
  // userId check or the owner could manually act for them.
  if (character.controlledBy === "ai") {
    throw new AdventureAccessError(403, "This character is controlled by an AI companion")
  }
  if (character.userId !== resolvedUserId) {
    throw new AdventureAccessError(403, "You are not authorized to act for this character")
  }
  return character
}

export function createAdventureAccess(ports: GmPorts) {
  async function assertAdventureAccess(userId: string | null | undefined, adventureId: string): Promise<AdventureDoc> {
    const resolvedUserId = requireUserId(userId)
    const adventure = await ports.store.getAdventure({ adventureId })
    if (!adventure) {
      throw new AdventureAccessError(404, "Adventure not found")
    }
    if (!userCanAccessAdventure(resolvedUserId, adventure)) {
      throw new AdventureAccessError(403, "Forbidden")
    }
    return adventure
  }

  async function assertAdventureAccessByTurn(userId: string | null | undefined, turnId: string): Promise<{ adventure: AdventureDoc; turn: TurnDoc }> {
    const turn = await ports.store.getTurn({ turnId })
    if (!turn) {
      throw new AdventureAccessError(404, "Turn not found")
    }
    const adventure = await assertAdventureAccess(userId, turn.adventureId)
    return { adventure, turn }
  }
  return { assertAdventureAccess, assertAdventureAccessByTurn }
}
