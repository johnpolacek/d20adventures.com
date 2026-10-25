"use client"

import { useEffect, useState } from "react"
import { getAdventureLobbyData } from "@/app/_actions/adventure"
import type { Id } from "@/convex/_generated/dataModel"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { Adventure } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PC, PCTemplate } from "@/types/character"

interface UseAdventureLobbyProps {
  adventureId: Id<"adventures">
  initialAdventure: Adventure
  initialAdventurePlan: AdventurePlan
  enabled?: boolean
  pollInterval?: number
}

export function useAdventureLobby({
  adventureId,
  initialAdventure,
  initialAdventurePlan,
  enabled = true,
  pollInterval = 2000, // Poll every 2 seconds
}: UseAdventureLobbyProps) {
  const [adventure, setAdventure] = useState<Adventure>(initialAdventure)
  const [adventurePlan, setAdventurePlan] = useState<AdventurePlan>(initialAdventurePlan)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now())

  const fetchLobbyData = async () => {
    if (!enabled) return
    try {
      setIsLoading(true)
      setError(null)
      const lobbyData = await getAdventureLobbyData(adventureId)
      if (!lobbyData) {
        throw new Error("Adventure not found")
      }
      // Only update if we have newer data
      if (lobbyData.updatedAt > lastUpdate) {
        // Resolve party data from players
        let party: PC[] = []
        if (lobbyData.players && Array.isArray(lobbyData.players)) {
          const partyResults = await Promise.all(
            lobbyData.players.map(async (player: { userId: string; characterId: string }) => {
              if (typeof player.characterId === "string" && player.characterId.startsWith("characters/")) {
                try {
                  const pcTemplate = (await readJsonFromS3(player.characterId)) as PCTemplate
                  return { ...pcTemplate, userId: player.userId } as PC
                } catch (err) {
                  console.error("[useAdventureLobby] Failed to load custom character:", player.characterId, err)
                  return undefined
                }
              } else if (adventurePlan?.premadePlayerCharacters) {
                const pc = adventurePlan.premadePlayerCharacters.find((c) => c.id === player.characterId)
                if (pc && typeof pc === "object") return { ...pc, userId: player.userId } as PC
              }
              return undefined
            })
          )
          party = partyResults.filter((pc): pc is PC => !!pc)
        }
        // Update adventure with new party data
        setAdventure((prev) => ({
          ...prev,
          party,
          players: lobbyData.players,
        }))
        // Update available characters
        const availableCharacters = adventurePlan?.premadePlayerCharacters?.filter((pc) => !party.some((partyMember) => partyMember.id === pc.id)) || []
        setAdventurePlan((prev) => ({
          ...prev,
          premadePlayerCharacters: availableCharacters,
        }))
        setLastUpdate(lobbyData.updatedAt)
      }
    } catch (err) {
      console.error("[useAdventureLobby] Error fetching lobby data:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch lobby data")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!enabled) return
    fetchLobbyData()
    const interval = setInterval(fetchLobbyData, pollInterval)
    return () => {
      clearInterval(interval)
    }
  }, [enabled, pollInterval, adventureId, lastUpdate])

  // Calculate lobby state
  const minParty = adventurePlan.party?.[0] || 1
  const maxParty = adventurePlan.party?.[1] || 4
  const currentPartySize = adventure.party?.length || 0
  const canStartAdventure = currentPartySize >= minParty
  const partyIsFull = currentPartySize >= maxParty
  const hasEmptySlots = currentPartySize < maxParty

  const lobbyState = {
    currentPartySize,
    minParty,
    maxParty,
    canStartAdventure,
    partyIsFull,
    hasEmptySlots,
  }

  return {
    adventure,
    adventurePlan,
    lobbyState,
    isLoading,
    error,
    refetch: fetchLobbyData,
  }
}
