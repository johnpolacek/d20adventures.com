import { IMAGE_HOST } from "@/lib/config"
import { useTurnStore } from "@/lib/store/turn-store"
import { cn } from "@/lib/utils"
import { CheckCircle2 } from "lucide-react"
import { useState } from "react"

function CharacterImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="w-12 h-12 rounded-xl bg-black border border-white/30 relative overflow-hidden">
      <img
        src={src}
        alt={alt}
        className={"absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity duration-300" + (loaded ? " opacity-100" : " opacity-0")}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

export default function TurnCharacterList() {
  const currentTurn = useTurnStore((state) => state.currentTurn)
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
              character.isComplete ? "" : "from-primary-800 via-primary-800 to-primary-700",
              character.id === currentActorId
                ? "scale-100 shadow-md ring-primary-600 ring-2 saturate-125 contrast-110 brightness-125 from-primary-900"
                : "scale-90 from-primary-800/70 via-primary-800/70 opacity-80"
            )}
          >
            {character.image && <CharacterImage src={IMAGE_HOST + character.image} alt={character.name} />}
            <div>
              <div className="font-bold font-display flex items-center gap-2">
                {character.name}
                {character.isComplete && <CheckCircle2 className="absolute bottom-1.5 right-1.5 inline-block text-green-700 w-4 h-4 rounded-full bg-black ring-2 ring-black" />}
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
