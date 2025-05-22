import Image from "next/image"
import { IMAGE_HOST } from "@/lib/config"
import DiceRollResult from "@/components/adventure/dice-roll-result"

export default function CharacterDiceRollResultDisplay({
  character,
  rollType,
  difficulty,
  result,
  image,
}: {
  character: string
  rollType: string
  difficulty: number
  result: number
  image?: string
}) {
  // If image is not provided, fallback to a default or empty string
  const imageUrl = image || "/images/app/characters/default.png"
  return (
    <div className="relative font-display font-bold border border-primary-700 rounded-xl overflow-hidden">
      <div className="absolute top-0 left-0 w-2/3 h-full overflow-hidden">
        <Image className="object-cover" src={IMAGE_HOST + imageUrl} alt={character} fill={true} />
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-black to-transparent"></div>
      </div>
      <div className="px-4 py-6 flex flex-col gap-4 items-center justify-start w-1/2 relative left-1/2">
        <h4 className="text-sm">Dice Roll Result</h4>
        <h3 className="text-2xl">{rollType}</h3>
        <div className="font-mono text-xs text-primary-300 -mt-4 uppercase tracking-wider">(Target {difficulty})</div>
        <DiceRollResult result={result} />
      </div>
    </div>
  )
}
