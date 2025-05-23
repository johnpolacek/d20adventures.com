import DiceRoll from "@/components/ui/dice-roll"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { TurnCharacter } from "@/types/adventure"
import { IMAGE_HOST } from "@/lib/config"
import type { RollRequirement } from "@/lib/validations/roll-requirement-schema"

export default function CharacterDiceRoll({
  rollRequired,
  rollResult,
  onRoll,
  className,
  inputKey,
  character,
}: {
  rollRequired: NonNullable<RollRequirement>
  rollResult: number | null
  onRoll: (result: number) => void
  className?: string
  inputKey?: string | number
  character: TurnCharacter
}) {
  const { rollType, difficulty, modifier = 0 } = rollRequired

  console.log("[CharacterDiceRoll] rollRequired:", JSON.stringify(rollRequired, null, 2))

  return (
    <div className={cn("relative aspect-[4/5] sm:aspect-auto font-display font-bold border border-primary-700 rounded-xl overflow-hidden", className)}>
      <div className="absolute top-0 left-0 h-2/3 sm:h-full w-full sm:w-2/3 overflow-hidden">
        <Image className="object-cover" src={IMAGE_HOST + character.image} alt={character.name} fill={true} />
        <div className="absolute bottom-0 sm:bottom-auto sm:top-0 right-0 w-full sm:w-1/3 h-1/3 sm:h-full bg-gradient-to-t sm:bg-gradient-to-l from-black to-transparent"></div>
      </div>
      <div className="px-4 py-6 flex flex-col gap-4 text-center items-center justify-start w-full sm:w-1/2 absolute bottom-0 sm:relative sm:left-1/2">
        <h4 className="text-sm">Dice Roll {rollResult === null ? "Needed" : ""}</h4>
        <h3 className="text-2xl">{rollType}</h3>
        <div className="font-mono text-xs text-primary-300 -mt-4 uppercase tracking-wider">
          Target {difficulty}
          {modifier !== 0 && <span className={modifier > 0 ? "text-green-400" : "text-red-400"}>{modifier > 0 ? `  +${modifier} bonus` : `  ${modifier} penalty`}</span>}
        </div>
        <DiceRoll key={inputKey} className="my-2 scale-90 sm:scale-100" iconSize={48} id="d20-roll" {...(rollResult === null ? { onRoll } : {})} />
      </div>
    </div>
  )
}
