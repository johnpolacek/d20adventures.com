import type { Store, TurnRecord } from "@d20/gm-core"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { sheetId } from "@/lib/host/seats"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"

/** Convex IDs are branded only at the host boundary. Documents remain unchanged. */
export const serverStore: Store = {
  getTurn: ({ turnId }) => convex.query(api.adventure.getTurnById, { turnId: turnId as Id<"turns"> }) as Promise<TurnRecord | null>,
  getAdventure: ({ adventureId }) => convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> }),
  getTurns: ({ adventureId }) => convex.query(api.adventure.getTurnsByAdventure, { adventureId: adventureId as Id<"adventures"> }) as Promise<TurnRecord[]>,
  getTurnByOrder: ({ adventureId, order }) => convex.query(api.adventure.getTurnByOrder, { adventureId: adventureId as Id<"adventures">, order }) as Promise<TurnRecord | null>,
  submitReply: ({ turnId, ...args }) => convex.mutation(api.adventure.submitReply, { ...args, turnId: turnId as Id<"turns"> }),
  updateTurn: ({ turnId, ...args }) => convex.mutation(api.turns.updateTurn, { ...args, turnId: turnId as Id<"turns"> }),
  patchAdventure: ({ adventureId, patch }) =>
    convex.mutation(api.turns.patchAdventure, {
      adventureId: adventureId as Id<"adventures">,
      patch: { ...patch, currentTurnId: patch.currentTurnId as Id<"turns"> | undefined },
    }),
  // A hero is a file in their player's account. The levelled sheet is written over the one it holds.
  keepHero: async ({ adventureId, characterId, sheet }) => {
    const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> })
    const key = adventure?.players?.find((player) => sheetId(player.characterId) === characterId)?.characterId
    if (!key?.startsWith("characters/")) return
    const hero = (await readJsonFromS3(key)) as Record<string, unknown>
    await updateJsonOnS3(key, { ...hero, sheet })
  },
  createTurn: ({ adventureId, ...args }) => convex.mutation(api.turns.createTurn, { ...args, adventureId: adventureId as Id<"adventures"> }),
  commitWikiTurnAdvance: ({ adventureId, expectedCurrentTurnId, ...args }) =>
    convex.mutation(api.adventure.commitWikiTurnAdvance, {
      ...args,
      adventureId: adventureId as Id<"adventures">,
      expectedCurrentTurnId: expectedCurrentTurnId as Id<"turns">,
    }),
  createAdventureWithFirstTurn: (args) => convex.mutation(api.adventure.createAdventureWithFirstTurn, args),
}
