import { IMAGE_HOST } from "@/lib/config"
import { useTurn } from "@/lib/context/TurnContext"
import { cn } from "@/lib/utils"
import { CircleCheckBig } from "lucide-react"
import { useState } from "react"
import Image from "next/image"

function CharacterImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="w-8 sm:w-12 h-8 sm:h-12 rounded-xl bg-black border border-white/30 relative overflow-hidden z-10">
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
    <div className="lg:w-[320px] rounded-xl p-1">
      <ul className="flex flex-col gap-4">
        {characters.map((character) => {
          const isDead = character.healthPercent === 0
          return (
            <li
              key={character.id}
              className={cn(
                "w-full max-w-[300px] sm:w-[320px] flex items-center gap-3 p-1.5 sm:p-2 relative rounded-xl transition-all duration-1000 ease-in-out bg-gradient-to-tl ring ring-primary-700",
                isDead ? "ring-gray-700 from-gray-800/50 via-gray-800/50 to-gray-700/50 opacity-60" : character.isComplete ? "ring-primary-600" : "from-primary-800 via-primary-800 to-primary-700",
                character.id === currentActorId && !isDead ? "scale-100 shadow-md ring-primary-600 ring-2 from-primary-900" : "scale-90 from-primary-800/70 via-primary-800/70 opacity-90",
                isDead && "opacity-50 scale-90" // Ensure dead characters are visually distinct
              )}
            >
              {character.image && <CharacterImage src={`${IMAGE_HOST}/${character.image.startsWith("/") ? character.image.slice(1) : character.image}`} alt={character.name} />}
              <div className="z-10">
                <div className="text-xxs sm:text-sm font-bold font-display flex items-center gap-2">
                  {character.name}
                  {character.isComplete && !isDead && <CircleCheckBig className="absolute bottom-1.5 right-1.5 inline-block text-green-700 w-4 h-4 rounded-full bg-black ring-2 ring-black" />}
                </div>
                {character.archetype !== "Monster" && (
                  <div className="text-xxxs sm:text-xxs font-display">
                    {character.gender} {character.race} {character.archetype}
                  </div>
                )}

                {characters.length > 1 && !isDead && (
                  <div className="text-base flex items-center justify-center rounded-full bg-black ring ring-primary-600 w-8 h-8 font-mono absolute top-4 -left-5">{character.initiative}</div>
                )}
              </div>
              {character.status && !isDead && (
                <div className="text-xxxs sm:text-xxs font-mono px-2 py-0.5 bg-black rounded absolute -bottom-2 ring ring-primary-700 right-8 z-10">{character.status}</div>
              )}
              {isDead && <div className="text-xxs sm:text-xs text-red-400 font-bold font-mono px-2 py-0.5 bg-black rounded absolute -bottom-2 ring ring-red-700 right-8 z-10">DEAD</div>}
              {!isDead && (
                <div className="absolute top-0 left-0 w-full h-full rounded-xl overflow-hidden">
                  <div
                    className="absolute top-0 left-0 w-full h-full bg-red-800 transition-all duration-1000 ease-in-out"
                    style={{ width: `${100 - character.healthPercent}%`, opacity: (100 - character.healthPercent) / 100 }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
