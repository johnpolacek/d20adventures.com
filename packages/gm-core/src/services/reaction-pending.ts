import type { ReactionOffer } from "../sheet/reactions"

/**
 * Thrown from inside an NPC's turn when a player's hero is offered a reaction that no one has answered yet. The turn
 * has written nothing. What it had settled comes along, so the turn can be played again the same once the answer is
 * in: how the NPC's move was read, the dice rolled so far, and the answers already given.
 */
export class ReactionPending extends Error {
  constructor(
    readonly offer: ReactionOffer,
    readonly text: string,
    readonly resume: { reading: unknown; dice: number[]; answers: boolean[]; action?: unknown }
  ) {
    super(`A reaction is offered: ${text}`)
    this.name = "ReactionPending"
  }
}
