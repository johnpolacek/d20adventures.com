"use server"

// Get-or-generate avatar-derived standee minis for every character in a turn.
// Returns characterId -> public cutout PNG URL; characters whose generation
// fails (or who have no portrait) are simply omitted and the renderer falls
// back to a modeled mini or portrait pawn.

import { auth } from "@clerk/nextjs/server"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { getOrCreateStandee } from "@/lib/encounterview/standee"
import { getImageUrl } from "@/lib/utils"

const CONCURRENCY = 3

export async function getOrGenerateCharacterMinis(args: { turnId: string }): Promise<{ minis: Record<string, string> }> {
  const { userId } = await auth()
  const { turn } = await assertAdventureAccessByTurn(userId, args.turnId as Id<"turns">)

  const candidates = turn.characters.filter((c) => typeof c.image === "string" && c.image.length > 0)
  const minis: Record<string, string> = {}

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY)
    const urls = await Promise.all(
      batch.map((c) =>
        getOrCreateStandee({
          imageUrl: getImageUrl(c.image as string),
          name: c.name,
          race: c.race,
          archetype: c.archetype,
          appearance: c.appearance,
        })
      )
    )
    batch.forEach((c, index) => {
      const url = urls[index]
      if (url) minis[c.id] = url
    })
  }

  return { minis }
}
