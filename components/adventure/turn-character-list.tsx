import { IMAGE_HOST } from "@/lib/config"
import { useTurn } from "@/lib/context/TurnContext"
import { cn } from "@/lib/utils"
import { CircleCheckBig } from "lucide-react"
import { useState } from "react"
import Image from "next/image"

function CharacterImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="w-12 h-12 rounded-xl bg-black border border-white/30 relative overflow-hidden">
      <Image
        src={src}
        alt={alt}
        fill
        className={"absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity duration-300" + (loaded ? " opacity-100" : " opacity-0")}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

export default function TurnCharacterList() {
  const currentTurn = useTurn()
  const characters = (currentTurn?.characters || []).slice().sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
  // Find the current actor: highest initiative, not complete
  const currentActorId = characters.find((c) => !c.isComplete)?.id
  return (
    <div className="w-[320px] rounded-xl p-1">
      <ul className="flex flex-col gap-2">
        {characters.map((character) => (
          <li
            key={character.id}
            className={cn(
              "flex items-center gap-3 p-2 relative rounded-xl transition-all duration-1000 ease-in-out bg-gradient-to-tl ring ring-primary-700",
              character.isComplete ? "ring-primary-600 saturate-50" : "from-primary-800 via-primary-800 to-primary-700",
              character.id === currentActorId
                ? "scale-100 shadow-md ring-primary-600 ring-2 saturate-125 contrast-110 brightness-125 from-primary-900"
                : "scale-90 from-primary-800/70 via-primary-800/70 opacity-90"
            )}
          >
            {character.healthPercent && (
              <div className="absolute top-0 left-0 w-full h-full rounded-xl overflow-hidden">
                <div
                  className="absolute top-0 left-0 w-full h-full bg-red-500/50 transition-all duration-1000 ease-in-out"
                  style={{ width: `${100 - character.healthPercent}%`, opacity: (character.id === currentActorId ? 0.33 : 0.75) * (1 - character.healthPercent / 100) }}
                />
              </div>
            )}
            {character.image && <CharacterImage src={IMAGE_HOST + character.image} alt={character.name} />}
            <div>
              <div className="font-bold font-display flex items-center gap-2">
                {character.name}
                {character.isComplete && <CircleCheckBig className="absolute bottom-1.5 right-1.5 inline-block text-green-700 w-4 h-4 rounded-full bg-black ring-2 ring-black" />}
              </div>
              {character.archetype !== "Monster" ? (
                <div className="text-xxs font-display">
                  {character.gender} {character.race} {character.archetype}
                </div>
              ) : null}
              {characters.length > 1 && (
                <div className="text-base flex items-center justify-center rounded-full bg-black ring ring-primary-600 w-8 h-8 font-mono absolute top-4 -left-5">{character.initiative}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
