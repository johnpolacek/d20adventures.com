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
}

export const reactionName = (id: string): string => REACTION_NAMES[id as ReactionId] ?? "Reaction"

export const ORDERS: { id: Order; name: string }[] = [
  { id: "always", name: "Always" },
  { id: "when-it-matters", name: "When It Matters" },
  { id: "never", name: "Never" },
]

/** The engine's default orders: every Opportunity Attack, and the rest only when they matter. */
export const DEFAULT_ORDER: Record<ReactionId, Order> = {
  "opportunity-attack": "always",
  shield: "when-it-matters",
  parry: "when-it-matters",
  "uncanny-dodge": "when-it-matters",
  counterspell: "when-it-matters",
}

/** One reaction a hero has, with the order they follow for it, the default where none is set. */
export type OrderRow = { id: ReactionId; name: string; order: Order }

/**
 * The reactions a hero can have, each with its order. Every hero has the Opportunity Attack, and one with the Shield
 * spell prepared has Shield. `prepared` is the sheet's prepared spells by name.
 */
export function heroReactions(prepared: readonly string[] | undefined, orders: StandingOrders | undefined): OrderRow[] {
  const ids: ReactionId[] = ["opportunity-attack", ...(prepared?.some((name) => name.toLowerCase() === "shield") ? (["shield"] as const) : [])]
  return ids.map((id) => ({ id, name: REACTION_NAMES[id], order: orders?.[id] ?? DEFAULT_ORDER[id] }))
}
