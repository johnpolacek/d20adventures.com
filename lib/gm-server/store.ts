import type { Store, TurnRecord } from "@d20/gm-core"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"

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
  createTurn: ({ adventureId, ...args }) => convex.mutation(api.turns.createTurn, { ...args, adventureId: adventureId as Id<"adventures"> }),
  commitWikiTurnAdvance: ({ adventureId, expectedCurrentTurnId, ...args }) =>
    convex.mutation(api.adventure.commitWikiTurnAdvance, {
      ...args,
      adventureId: adventureId as Id<"adventures">,
      expectedCurrentTurnId: expectedCurrentTurnId as Id<"turns">,
    }),
  createAdventureWithFirstTurn: (args) => convex.mutation(api.adventure.createAdventureWithFirstTurn, args),
}
