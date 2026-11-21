"use client"

// The turn page's reaction offer: a hero offered a reaction in the middle of an NPC's turn, while the round waits on
// the answer. The hero's player answers it here. Anyone else sees who is deciding.

import { useUser } from "@clerk/nextjs"
import { answerReaction } from "@/app/_actions/adventure"
import { ensureNpcProcessed } from "@/app/_actions/ensure-npc-processed"
import { Presence } from "@d20/ui/presence"
import { ReactionCard, useExpired } from "@d20/ui/stage/reaction-card"
import type { Id } from "@/convex/_generated/dataModel"
import { useTurnContext } from "@/lib/context/TurnContext"
import { isAiControlledPc } from "@/lib/utils/turn-actors"
import type { TurnCharacter } from "@/types/adventure"

/** Whether this user answers for a hero: their own, not one the AI plays. In practice play every hero is theirs. */
export const controlsHero = (character: TurnCharacter | undefined, userId: string | null | undefined): boolean =>
  Boolean(character && userId && character.type === "pc" && character.userId === userId && !isAiControlledPc(character))

/** The turn's reaction offer while it waits on an answer: there, unanswered, and not run out. */
export function useStandingOffer() {
  const { currentTurn, disableSSE } = useTurnContext()
  const reaction = currentTurn?.reaction
  const expired = useExpired(reaction?.expiresAt)
  return !disableSSE && reaction && reaction.answer === undefined && !expired ? reaction : undefined
}

/** The offer's card. It stays for its exit once the offer is answered or runs out. `show` false hides it. */
export function TurnReaction({ show = true, className }: { show?: boolean; className?: string }) {
  const { currentTurn } = useTurnContext()
  const { user } = useUser()
  const reaction = useStandingOffer()
  const offered = show && currentTurn && reaction ? { turnId: currentTurn.id as Id<"turns">, reaction } : null
  const hero = currentTurn?.characters.find((c) => c.id === reaction?.offer.to)
  // The answer plays the turn on. Should that fail, the server is asked once more to play on, by the answer kept.
  const answer = (turnId: Id<"turns">, characterId: string, take: boolean) => {
    void answerReaction({ turnId, characterId, take }).catch((error) => {
      console.error("[TurnReaction] The answer did not play on:", error)
      void ensureNpcProcessed(turnId).catch(() => {})
    })
  }
  return (
    <Presence show={Boolean(offered)} motion="fade" className={className}>
      {offered && (
        <ReactionCard
          key={`${offered.reaction.npc}:${offered.reaction.expiresAt}`}
          reaction={offered.reaction.offer.id}
          hero={hero?.name ?? "A hero"}
          expiresAt={offered.reaction.expiresAt}
          text={offered.reaction.text}
          mine={controlsHero(hero, user?.id)}
          onTake={() => answer(offered.turnId, offered.reaction.offer.to, true)}
          onPass={() => answer(offered.turnId, offered.reaction.offer.to, false)}
        />
      )}
    </Presence>
  )
}
