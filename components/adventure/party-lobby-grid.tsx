import React from "react"
import type { Adventure } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PC, PCTemplate } from "@/types/character"
import { PartySlot } from "./party-slot"

interface PartyLobbyGridProps {
  adventure: Adventure
  adventurePlan: AdventurePlan
  userId?: string
  onCharacterClick?: (character: PC | PCTemplate) => void
  onJoinClick?: (characterId: string) => void
  isJoining?: boolean
  availableCharacters?: PCTemplate[]
}

export function PartyLobbyGrid({ adventure, adventurePlan, userId, onCharacterClick, onJoinClick, isJoining = false, availableCharacters = [] }: PartyLobbyGridProps) {
  const maxParty = adventurePlan.party?.[1] || 4
  const party = adventure.party || []

  // Find the user's character if present
  let userChar: PC | undefined = undefined
  let otherChars: PC[] = []
  if (userId) {
    userChar = party.find((c) => c.userId === userId)
    otherChars = party.filter((c) => c.userId !== userId)
  } else {
    otherChars = party
  }

  // Build the slots array, placing the user in the 2nd slot (index 1) if present
  const slots: React.ReactNode[] = []
  let charIdx = 0
  for (let i = 0; i < maxParty; i++) {
    if (i === 1 && userChar) {
      // 2nd slot: user character
      slots.push(<PartySlot key={userChar.id} character={userChar} isUserCharacter={true} onClick={() => (onCharacterClick ? onCharacterClick(userChar!) : undefined)} />)
    } else if (charIdx < otherChars.length) {
      const character = otherChars[charIdx]
      slots.push(<PartySlot key={character.id} character={character} isUserCharacter={false} onClick={() => (onCharacterClick ? onCharacterClick(character) : undefined)} />)
      charIdx++
    } else {
      // If there are available premade characters, allow joining with the first available
      let joinableChar: PCTemplate | undefined = undefined
      if (availableCharacters.length > 0) {
        joinableChar = availableCharacters[0]
      }
      slots.push(
        <PartySlot key={`empty-${i}`} isAvailable={!!joinableChar && !!onJoinClick} onJoinClick={joinableChar && onJoinClick ? () => onJoinClick(joinableChar.id) : undefined} isJoining={isJoining} />
      )
    }
  }

  // Use 3 columns for up to 6 slots, otherwise fallback to 2 columns
  const colCount = maxParty >= 3 ? "sm:flex-[0_0_calc(33.333%-1rem)]" : "sm:flex-[0_0_calc(50%-1rem)]"

  return (
    <div className={`flex flex-wrap gap-6 justify-center items-center w-full max-w-2xl mx-auto mb-8`}>
      {slots.map((slot, index) => (
        <div key={index} className={`flex-[0_0_100%] ${colCount}`}>
          {slot}
        </div>
      ))}
    </div>
  )
}
