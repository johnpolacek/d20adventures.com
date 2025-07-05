import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getImageUrl } from "@/lib/utils"
import type { PCTemplate } from "@/types/character"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface CharacterSelectCardProps {
  character: PCTemplate
  buttonLabel: string
  onButtonClick?: () => void
  href?: string
  buttonAsChild?: boolean
  className?: string
  disabled?: boolean
}

export function CharacterSelectCard({ character, buttonLabel, onButtonClick, href, buttonAsChild = false, className, disabled = false }: CharacterSelectCardProps) {
  return (
    <Card
      className={cn(
        "bg-black text-white rounded-lg overflow-hidden flex flex-col items-center ring-8 ring-black/30 border border-white/10 p-0 font-display w-full h-full transition-all ease-in-out duration-500",
        onButtonClick && "cursor-pointer hover:scale-105 hover:ring-primary-400",
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
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
      </div>
      <div className="pb-6 -mt-10 z-10 relative flex flex-col justify-center items-center">
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
      </div>
    </Card>
  )
}

export default CharacterSelectCard
