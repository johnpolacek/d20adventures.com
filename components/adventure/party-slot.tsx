import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn, getImageUrl } from "@/lib/utils"
import type { PC, PCTemplate } from "@/types/character"
import Image from "@/components/ui/native-image"
import React from "react"

interface PartySlotProps {
  character?: PC | PCTemplate
  isUserCharacter?: boolean
  isAvailable?: boolean
  onClick?: () => void
  onJoinClick?: () => void
  isJoining?: boolean
  playerName?: string
}

export function PartySlot({ character, isUserCharacter = false, isAvailable = false, onClick, onJoinClick, isJoining = false, playerName }: PartySlotProps) {
  if (character) {
    return (
      <Card
        className={cn(
          "bg-black text-white rounded-lg overflow-hidden flex flex-col items-center ring-4 ring-black/30 border border-white/10 p-0 font-display w-full h-full hover:scale-[1.01] transition-all ease-in-out duration-500 cursor-pointer hover:scale-105 hover:ring-primary-400/80",
          isUserCharacter && "ring-4 ring-primary-400/50 ring-8 hover:ring-primary-400/80"
        )}
        onClick={onClick}
        title={character.name}
      >
        <div className="w-full aspect-video relative">
          <Image src={getImageUrl(character.image)} alt={character.name} fill={true} className="object-cover w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
        </div>
        <div className="pb-6 -mt-10 z-10 relative flex flex-col justify-center items-center">
          <div className={cn("font-bold text-xl xl:text-3xl mb-1 truncate w-full text-center", isUserCharacter ? "text-amber-400" : "text-white")}>{character.name}</div>
          <div className="text-base mb-4 text-center text-white/90">
            {character.gender} {character.race} {character.archetype}
          </div>
          {isUserCharacter ? (
            <div className="text-xs bg-amber-800 rounded-sm px-2 py-0.5 text-amber-200 font-mono tracking-wider font-bold">{playerName || "YOU"}</div>
          ) : (
            <div className="text-xs bg-primary-700 rounded-sm px-2 py-0.5 text-primary-200 font-mono tracking-wider font-bold">{playerName || "Player"}</div>
          )}
        </div>
      </Card>
    )
  }
  // Empty slot
  return (
    <Card className="bg-black text-white rounded-lg overflow-hidden flex flex-col items-center ring-4 ring-black/30 border border-dashed border-white/30 p-0 font-display w-full h-full scale-95">
      <div className="w-full aspect-video relative">
        <Image src="/images/app/characters/default.png" alt="Empty slot" fill={true} className="object-cover w-full h-full opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
      </div>
      <div className="pb-6 -mt-10 z-10 relative flex flex-col justify-center items-center">
        <div className="font-bold text-3xl mb-1 truncate w-full text-center text-white/50">Empty</div>
        <div className="text-base mb-4 text-center text-white/40">Available Slot</div>
        {isAvailable && onJoinClick && (
          <Button size="sm" variant="epic" className="text-sm" onClick={onJoinClick} disabled={isJoining}>
            {isJoining ? "Joining..." : "Join"}
          </Button>
        )}
      </div>
    </Card>
  )
}
