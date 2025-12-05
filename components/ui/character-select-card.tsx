import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getImageUrl } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { PCTemplate } from "@/types/character"
import { UserRoundX } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

interface CharacterSelectCardProps {
  character: PCTemplate
  buttonLabel: string
  onButtonClick?: () => void
  href?: string
  buttonAsChild?: boolean
  className?: string
  disabled?: boolean
  clickable?: boolean
  onDelete?: () => void
}

export function CharacterSelectCard({ character, buttonLabel, onButtonClick, href, buttonAsChild = false, className, disabled = false, clickable = false, onDelete }: CharacterSelectCardProps) {
  return (
    <Card
      className={cn(
        "bg-black text-white rounded-lg overflow-hidden flex flex-col items-center ring-8 ring-black/30 border border-white/10 p-0 font-display w-full h-full hover:scale-[1.01] transition-all ease-in-out duration-500",
        (onButtonClick || clickable) && "cursor-pointer hover:scale-105 hover hover:ring-primary-400/80",
        className
      )}
      onClick={onButtonClick}
    >
      <div className="w-full aspect-video relative">
        {character.image ? (
          <Image src={getImageUrl(character.image)} alt={character.name} fill={true} className="object-cover w-full h-full" />
        ) : (
          <span className="text-xs text-white/40">No Image</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
      </div>
      <div className="pb-6 -mt-10 z-10 relative flex flex-col justify-center items-center w-full">
        <div className="font-bold text-3xl text-amber-400 mb-1 truncate w-full text-center">{character.name}</div>
        <div className="text-base mb-4 text-center">
          {character.gender} {character.race} {character.archetype}
        </div>
        {href ? (
          <Link href={href} className="w-full flex justify-center">
            <Button asChild={buttonAsChild} variant="epic" className="text-sm" size="sm" disabled={disabled}>
              {buttonLabel}
            </Button>
          </Link>
        ) : (
          <Button variant="epic" className="text-sm" size="sm" disabled={disabled}>
            {buttonLabel}
          </Button>
        )}
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute bottom-2 right-2 p-0 h-6 w-6 bg-red-900/30 hover:bg-red-600/70 text-red-500/70 z-20"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            aria-label="Delete character"
          >
            <UserRoundX className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  )
}

export default CharacterSelectCard
