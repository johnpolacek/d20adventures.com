import Image from "next/image"
import DiceRollResult from "@/components/adventure/dice-roll-result"
import { getImageUrl } from "@/lib/utils"

export default function CharacterDiceRollResultDisplay({
  character,
  rollType,
  difficulty,
  result,
  image,
  modifier,
  baseRoll,
}: {
  character: string
  rollType: string
  difficulty: number
  result: number
  image?: string
  modifier?: number
  baseRoll?: number
}) {
  const imageUrl = image || "/images/app/characters/default.png"
  return (
    <div className="relative aspect-[4/5] sm:aspect-auto font-display font-bold border border-primary-700 rounded-xl overflow-hidden">
      <div className="absolute top-0 left-0 h-2/3 sm:h-full w-full sm:w-2/3 overflow-hidden">
        <Image className="object-cover" src={getImageUrl(imageUrl)} alt={character} fill={true} />
        <div className="absolute bottom-0 sm:bottom-auto sm:top-0 right-0 w-full sm:w-1/3 h-1/3 sm:h-full bg-gradient-to-t sm:bg-gradient-to-l from-black to-transparent"></div>
      </div>
      <div className="px-4 py-6 flex flex-col gap-2 text-center items-center justify-start w-full sm:w-1/2 absolute bottom-0 sm:relative sm:left-1/2">
        <h4 className="text-xs opacity-70">Dice Roll Result</h4>
        <h3 className="text-2xl">{rollType}</h3>
        <div className="font-mono text-xs text-primary-300 -mt-2 uppercase tracking-wider">
          <span className="scale-90">Target {difficulty}</span>
          {typeof baseRoll === "number" && modifier !== 0 && (
            <>
              <span className="font-bold text-white">
                {" "}
                <span className="text-white/50">|</span> {baseRoll}
              </span>
              {typeof modifier === "number" && modifier !== 0 && (
                <>
                  <span className={modifier > 0 ? "text-green-500" : "text-red-500"}>
                    {" "}
                    {modifier > 0 ? " + " : " - "}
                    {Math.abs(modifier)}
                  </span>
                </>
              )}
              {typeof modifier === "number" && modifier !== 0 ? <> </> : null}
            </>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <DiceRollResult result={result} />
        </div>
      </div>
    </div>
  )
}
