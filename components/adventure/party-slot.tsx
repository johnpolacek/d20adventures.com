import React from "react"
import { Button } from "@/components/ui/button"
import { cn, getImageUrl } from "@/lib/utils"
import type { PC, PCTemplate } from "@/types/character"
import Image from "next/image"
import { UserIcon } from "@heroicons/react/24/solid"

interface PartySlotProps {
  character?: PC | PCTemplate
  isUserCharacter?: boolean
  isAvailable?: boolean
  onClick?: () => void
  onJoinClick?: () => void
  isJoining?: boolean
}

export function PartySlot({ character, isUserCharacter = false, isAvailable = false, onClick, onJoinClick, isJoining = false }: PartySlotProps) {
  if (character) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-2 rounded-lg border-2 ${isUserCharacter ? "border-4 border-amber-400/50" : "border-white/20"} bg-black/40 aspect-[3/4] w-full shadow-lg cursor-pointer hover:ring-4 hover:ring-amber-400/50 transition-all`}
        onClick={onClick}
        title={character.name}
      >
        <div className="w-full rounded-full ring-4 ring-white/20 overflow-hidden aspect-square max-w-[120px] mb-2 relative">
          <Image fill src={getImageUrl(character.image)} alt={character.name} />
        </div>
        <div className={cn("text-white font-display text-lg text-center truncate w-full", isUserCharacter && "text-amber-400")}>{character.name}</div>
        <div className="text-xs font-display text-white/90 mt-1">
          {character.gender} {character.race} {character.archetype}
        </div>
        {isUserCharacter && <div className="mt-4 text-xs bg-amber-800 rounded-sm px-2 py-0.5 text-amber-200 font-mono tracking-wider font-bold">YOU</div>}
      </div>
    )
  }
  // Empty slot
  return (
    <div className="flex flex-col items-center justify-center p-2 rounded-lg border-2 border-dashed border-white/20 bg-black/50 aspect-[3/4] w-full scale-95">
      <div className="w-full aspect-square max-w-[120px] mb-2 flex items-center justify-center bg-gray-800/60 rounded-full border border-white/10">
        <UserIcon className="w-12 h-12 text-white/30" />
      </div>
      <div className="text-white/50 font-display text-lg text-center">Empty</div>
      {isAvailable && onJoinClick && (
        <Button size="sm" variant="epic" className="mt-2" onClick={onJoinClick} disabled={isJoining}>
          {isJoining ? "Joining..." : "Join"}
        </Button>
      )}
    </div>
  )
}
