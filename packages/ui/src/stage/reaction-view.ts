// A reaction offered to a hero, and a hero's standing orders, as the screens show them. It reads no rules data, so
// the browser does not load it: the wait, the names and the default orders are the engine's
// (packages/gm-core/src/sheet/reactions.ts), written again here.

import type { Order, ReactionId, StandingOrders } from "@d20/gm-core/sheet/turn-effect"

export type { Order, ReactionId, StandingOrders }

/** How long the round waits on a player's answer, in milliseconds: the engine's REACTION_WAIT. */
export const REACTION_WAIT_MS = 20_000

export const REACTION_NAMES: Record<ReactionId, string> = {
  "opportunity-attack": "Opportunity Attack",
  shield: "Shield",
  parry: "Parry",
  "uncanny-dodge": "Uncanny Dodge",
  counterspell: "Counterspell",
  "cutting-words": "Cutting Words",
}

// A class's reaction the list above does not name, by its id: "deflect-attacks" is "Deflect Attacks".
const titled = (id: string): string => id.replace(/(^|-)(\w)/g, (_, dash: string, letter: string) => `${dash ? " " : ""}${letter.toUpperCase()}`)

export const reactionName = (id: string): string => REACTION_NAMES[id] ?? (id ? titled(id) : "Reaction")

export const ORDERS: { id: Order; name: string }[] = [
  { id: "always", name: "Always" },
  { id: "when-it-matters", name: "When It Matters" },
  { id: "never", name: "Never" },
]

/** The engine's default orders: every Opportunity Attack, and the rest only when they matter, a class's own among them. */
export const DEFAULT_ORDER: Record<ReactionId, Order> = {
  "opportunity-attack": "always",
  shield: "when-it-matters",
  parry: "when-it-matters",
  "uncanny-dodge": "when-it-matters",
  counterspell: "when-it-matters",
  "cutting-words": "when-it-matters",
}

/** One reaction a hero has, with the order they follow for it, the default where none is set. */
export type OrderRow = { id: ReactionId; name: string; order: Order }

/**
 * The reactions a hero has, each with its order. `reactions` is the sheet view's list, the engine's own
 * (`reactionsOf`): every hero has the Opportunity Attack, and the rest come with a spell or a feature.
 */
export function heroReactions(reactions: readonly ReactionId[] | undefined, orders: StandingOrders | undefined): OrderRow[] {
  return (reactions ?? ["opportunity-attack"]).map((id) => ({ id, name: reactionName(id), order: orders?.[id] ?? DEFAULT_ORDER[id] ?? "when-it-matters" }))
}
