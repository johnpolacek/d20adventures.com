import DiceRoll from "@/components/ui/dice-roll"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { TurnCharacter } from "@/types/adventure"
import { IMAGE_HOST } from "@/lib/config"

export default function CharacterDiceRoll({
  rollType,
  difficulty,
  rollResult,
  onRoll,
  className,
  inputKey,
  character,
}: {
  rollType: string
  difficulty: number
  rollResult: number | null
  onRoll: (result: number) => void
  className?: string
  inputKey?: string | number
  character: TurnCharacter
}) {
  return (
    <div className={cn("relative font-display font-bold border border-primary-700 rounded-xl overflow-hidden", className)}>
      <div className="absolute top-0 left-0 w-2/3 h-full overflow-hidden">
        <Image className="object-cover" src={IMAGE_HOST + character.image} alt={character.name} fill={true} />
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-black to-transparent"></div>
      </div>
      <div className="px-4 py-6 flex flex-col gap-4 items-center justify-start w-1/2 relative left-1/2">
        <h4 className="text-sm">Dice Roll {rollResult === null ? "Needed" : ""}</h4>
        <h3 className="text-2xl">{rollType}</h3>
        <div className="font-mono text-xs text-primary-300 -mt-4 uppercase tracking-wider">(Target {difficulty})</div>
        <DiceRoll key={inputKey} className="my-2" iconSize={48} id="d20-roll" {...(rollResult === null ? { onRoll } : {})} />
      </div>
    </div>
  )
}
