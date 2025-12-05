"use server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { processNpcTurnsAfterCurrent } from "@/lib/services/npc-turn-service"
import type { TurnCharacter } from "@/types/adventure"
import { auth } from "@clerk/nextjs/server"

type DeferOrSkipArgs = {
  turnId: Id<"turns">
  characterId: string
  afterCharacterId?: string
  skipEntire?: boolean
}

export async function deferOrSkipTurn({ turnId, characterId, afterCharacterId, skipEntire }: DeferOrSkipArgs): Promise<{ status: "deferred" | "skipped" }> {
  console.log("[deferOrSkipTurn] called", { turnId: String(turnId), characterId, afterCharacterId, skipEntire })
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const turn = await convex.query(api.adventure.getTurnById, { turnId })
  if (!turn) throw new Error("Turn not found")
  console.log("[deferOrSkipTurn] loaded turn", { adventureId: String(turn.adventureId), encounterId: turn.encounterId })

  const characters: TurnCharacter[] = (turn.characters || []) as TurnCharacter[]
  const player = characters.find((c) => c.id === characterId)
  if (!player) throw new Error("Character not found in turn")
  if (player.type !== "pc") throw new Error("Only player characters can defer or skip")
  if (player.userId !== userId) throw new Error("You are not authorized to act for this character")
  console.log("[deferOrSkipTurn] player found", { playerName: player.name, playerInitiative: player.initiative })

  // Calculate candidates with lower initiative than the player's current initiative
  const playerInitiative = player.initiative ?? 0
  const lowerCandidates = characters
    .filter((c) => !c.isComplete && c.id !== player.id && (c.initiative ?? Number.NEGATIVE_INFINITY) < playerInitiative)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
  console.log(
    "[deferOrSkipTurn] lower candidates",
    lowerCandidates.map((c) => ({ id: c.id, name: c.name, initiative: c.initiative }))
  )

  // If explicitly skipping entire turn, mark complete regardless of available candidates
  if (skipEntire) {
    console.log("[deferOrSkipTurn] explicit skipEntire requested")
    const updatedCharacters: TurnCharacter[] = characters.map((c) =>
      c.id === player.id
        ? {
            ...c,
            hasReplied: true,
            isComplete: true,
          }
        : (c as TurnCharacter)
    )

    await convex.mutation(api.turns.updateTurn, {
      turnId,
      patch: {
        characters: updatedCharacters,
        updatedAt: Date.now(),
      },
    })
    console.log("[deferOrSkipTurn] updated turn characters for explicit skipEntire")

    try {
      await processNpcTurnsAfterCurrent(turnId)
    } catch (err) {
      console.error("[deferOrSkipTurn] NPC processing error after explicit skip:", err)
    }

    return { status: "skipped" }
  }

  // If an explicit target is provided and exists among characters, defer after it
  if (afterCharacterId) {
    const target = characters.find((c) => c.id === afterCharacterId)
    if (!target) throw new Error("Target character to defer after was not found")

    // Compute a new initiative slightly less than the target to ensure ordering
    const targetInitiative = target.initiative ?? 0
    const newInitiative = targetInitiative - 1
    console.log("[deferOrSkipTurn] deferring after target", { targetId: target.id, targetName: target.name, targetInitiative, newInitiative })

    const updatedCharacters: TurnCharacter[] = characters.map((c) =>
      c.id === player.id
        ? {
            ...c,
            initiative: newInitiative,
            // Ensure they have not replied/completed yet
            hasReplied: false,
            isComplete: false,
          }
        : (c as TurnCharacter)
    )

    await convex.mutation(api.turns.updateTurn, {
      turnId,
      patch: {
        characters: updatedCharacters,
        updatedAt: Date.now(),
      },
    })
    console.log("[deferOrSkipTurn] updated turn characters for defer")

    // If the next current actor becomes an NPC, kick off NPC processing
    try {
      await processNpcTurnsAfterCurrent(turnId)
    } catch (err) {
      console.error("[deferOrSkipTurn] NPC processing error:", err)
    }

    return { status: "deferred" }
  }

  // No target provided. If there are no later characters to defer behind, skip (pass) the turn.
  if (lowerCandidates.length === 0) {
    console.log("[deferOrSkipTurn] no lower candidates; skipping turn for player")
    const updatedCharacters: TurnCharacter[] = characters.map((c) =>
      c.id === player.id
        ? {
            ...c,
            hasReplied: true,
            isComplete: true,
          }
        : (c as TurnCharacter)
    )

    await convex.mutation(api.turns.updateTurn, {
      turnId,
      patch: {
        characters: updatedCharacters,
        updatedAt: Date.now(),
      },
    })
    console.log("[deferOrSkipTurn] updated turn characters for skip")

    // After skipping, process NPCs if applicable
    try {
      await processNpcTurnsAfterCurrent(turnId)
    } catch (err) {
      console.error("[deferOrSkipTurn] NPC processing error after skip:", err)
    }

    return { status: "skipped" }
  }

  // Safety: If we reached here without a valid target but candidates exist, place after the lowest-initiative candidate
  const lastCandidate = lowerCandidates[lowerCandidates.length - 1]
  const newInitiative = (lastCandidate.initiative ?? 0) - 1
  console.log("[deferOrSkipTurn] fallback defer after lowest candidate", {
    lastCandidateId: lastCandidate.id,
    lastCandidateName: lastCandidate.name,
    lastCandidateInitiative: lastCandidate.initiative,
    newInitiative,
  })
  const updatedCharacters: TurnCharacter[] = characters.map((c) =>
    c.id === player.id
      ? {
          ...c,
          initiative: newInitiative,
          hasReplied: false,
          isComplete: false,
        }
      : (c as TurnCharacter)
  )

  await convex.mutation(api.turns.updateTurn, {
    turnId,
    patch: {
      characters: updatedCharacters,
      updatedAt: Date.now(),
    },
  })
  console.log("[deferOrSkipTurn] updated turn characters for fallback defer")

  try {
    await processNpcTurnsAfterCurrent(turnId)
  } catch (err) {
    console.error("[deferOrSkipTurn] NPC processing error (fallback):", err)
  }

  return { status: "deferred" }
}
