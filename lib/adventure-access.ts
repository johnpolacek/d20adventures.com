import type { TurnRecord } from "@d20/gm-core"
import { assertPlayerCharacterControl as assertCoreCharacterControl } from "@d20/gm-core/access"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { createServerCore } from "@/lib/gm-server/core"

export { AdventureAccessError } from "@d20/gm-core/access"

// The Convex store returns the original documents. Preserve the host-facing types.
export async function assertAdventureAccess(userId: string | null | undefined, adventureId: Id<"adventures">): Promise<Doc<"adventures">> {
  return (await createServerCore().assertAdventureAccess(userId, adventureId)) as Doc<"adventures">
}

export async function assertAdventureAccessByTurn(userId: string | null | undefined, turnId: Id<"turns">): Promise<{ adventure: Doc<"adventures">; turn: Doc<"turns"> }> {
  return (await createServerCore().assertAdventureAccessByTurn(userId, turnId)) as { adventure: Doc<"adventures">; turn: Doc<"turns"> }
}

export function assertPlayerCharacterControl(userId: string | null | undefined, turn: Doc<"turns">, characterId: string): Doc<"turns">["characters"][number] {
  return assertCoreCharacterControl(userId, turn as TurnRecord, characterId) as Doc<"turns">["characters"][number]
}
