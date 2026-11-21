import { UserRoundX } from "lucide-react"
import Link from "next/link"
import { Button } from "@d20/ui/button"
import { Card } from "@d20/ui/card"
import Image from "@d20/ui/native-image"
import { picture } from "@/lib/images"
import { cn } from "@/lib/utils"
import type { PCTemplate } from "@/types/character"

interface CharacterSelectCardProps {
  character: PCTemplate
  buttonLabel: string
  onButtonClick?: () => void
  href?: string
  className?: string
  disabled?: boolean
  clickable?: boolean
  onDelete?: () => void
}

export function CharacterSelectCard({ character, buttonLabel, onButtonClick, href, className, disabled = false, clickable = false, onDelete }: CharacterSelectCardProps) {
  return (
    <Card
      variant="portrait"
      interactive={!!onButtonClick || clickable}
      className={cn("w-full h-full transition-[scale,box-shadow,border-color] duration-150 hover:scale-[1.01]", (onButtonClick || clickable) && "hover:scale-105 active:scale-100", className)}
      onClick={onButtonClick}
    >
      <div className="w-full aspect-video relative">
        {character.image ? (
          <Image {...picture(character.image, "(min-width: 768px) 400px, 100vw")} alt={character.name} fill={true} className="object-cover w-full h-full" />
        ) : (
          <span className="text-xs text-white/40">No Image</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
      </div>
      <div className="pb-6 -mt-10 z-10 relative flex flex-col justify-center items-center w-full">
        <div className="font-bold text-3xl text-accent-400 mb-1 truncate w-full text-center">{character.name}</div>
        <div className="text-base mb-4 text-center">
          {character.gender} {character.race} {character.archetype}
        </div>
        {href ? (
          <Link href={href} className="w-full flex justify-center">
            <Button variant="epic" className="text-sm" size="sm" disabled={disabled}>
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
            variant="destructive"
            size="icon"
            className="absolute bottom-2 right-2 z-20 size-7"
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
