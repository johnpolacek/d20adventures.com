"use client"

import DiceRollResult from "@/components/adventure/dice-roll-result"
import Image from "@/components/ui/native-image"
import { getImageUrl } from "@/lib/utils"

export default function CharacterDiceRollResultDisplay({
  character,
  rollType,
  difficulty,
  result,
  image,
  modifier = 0,
  baseRoll,
  dice,
  mode,
}: {
  character: string
  rollType: string
  difficulty: number
  result: number
  image?: string
  modifier?: number
  // The die that counts.
  baseRoll: number
  // Both d20s of a roll with Advantage or Disadvantage.
  dice?: number[]
  mode?: "advantage" | "disadvantage"
}) {
  // The die that did not count, shown struck through beside the one that did.
  const dropped = dice && dice.length > 1 ? dice[dice.indexOf(baseRoll) === 0 ? 1 : 0] : undefined
  const imageUrl = image || "/images/app/characters/default.png"
  return (
    <div className="relative aspect-[2/3] sm:aspect-auto font-display font-bold border border-primary-700 rounded-xl overflow-hidden">
      <div className="absolute top-0 left-0 h-1/2 sm:h-full w-full sm:w-2/3 overflow-hidden">
        <Image className="object-cover" src={getImageUrl(imageUrl)} alt={character} fill={true} />
        <div className="absolute bottom-0 left-0 text-center w-full md:w-3/4 pl-4 py-4 md:py-2 z-10 text-base text-primary-100 bg-gradient-to-t md:bg-gradient-to-r from-black/90 to-transparent">
          {character}
        </div>
        <div className="absolute bottom-0 sm:bottom-auto sm:top-0 right-0 w-full sm:w-1/3 h-1/3 sm:h-full bg-gradient-to-t sm:bg-gradient-to-l from-black to-transparent" />
      </div>
      <div className="px-4 py-6 flex flex-col gap-2 text-center items-center justify-start w-full sm:w-1/2 absolute bottom-0 sm:relative sm:left-1/2 z-10">
        <h4 className="text-xs opacity-70">Dice Roll Result</h4>
        <h3 className="text-2xl text-amber-300">{rollType}</h3>
        <div className="font-mono text-xs text-primary-300 -mt-2 uppercase tracking-wider">
          <span className="scale-90">Target {difficulty}</span>
          <span className="font-bold text-white">
            {" "}
            <span className="text-white/50">|</span> {baseRoll}
          </span>
          {dropped !== undefined && <span className="text-white/40 line-through"> {dropped}</span>}
          <span className={modifier < 0 ? "text-red-500" : "text-green-500"}>
            {modifier < 0 ? " - " : " + "}
            {Math.abs(modifier)}
          </span>
          {mode && <span className="block text-amber-200">{mode === "advantage" ? "Advantage" : "Disadvantage"}</span>}
        </div>
        <div className="flex flex-col items-center gap-1">
          <DiceRollResult result={result} />
        </div>
      </div>
    </div>
  )
}
