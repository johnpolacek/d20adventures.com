import { useUser } from "@clerk/nextjs"
import { conditionLabel } from "@d20/gm-core/utils/condition-label"
import { CircleCheckBig } from "lucide-react"
import { type CSSProperties, useState } from "react"
import { setStandingOrders } from "@/app/_actions/adventure"
import { DeathSaveMarks } from "@d20/ui/stage/roll-parts"
import { standingOf, standingWords, WOUND_TONE } from "@d20/ui/stage/standing"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { Presence } from "@d20/ui/presence"
import type { Id } from "@/convex/_generated/dataModel"
import { useTurnContext } from "@/lib/context/TurnContext"
import { pictureAt } from "@/lib/images"
import { cn } from "@/lib/utils"
import { isAiControlledPc, isDown } from "@/lib/utils/turn-actors"
import type { TurnCharacter } from "@/types/adventure"
import { CharacterSheetModal } from "./character-sheet-modal"
import { NPCCharacterSheetModal } from "./npc-character-sheet-modal"
import { controlsHero } from "./turn-reaction"
import { useSheetViews } from "@d20/ui/adventure/use-sheet-view"

function CharacterImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="w-8 sm:w-12 h-8 sm:h-12 rounded-xl bg-black border border-white/30 relative overflow-hidden z-10">
      <Image
        src={src}
        alt={alt}
        fill
        className={`absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity duration-150${loaded ? " opacity-100" : " opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

export default function TurnCharacterList() {
  const { currentTurn, disableSSE } = useTurnContext()
  const characters = (currentTurn?.characters || []).slice().sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
  const { user } = useUser()
  // Every hero's sheet, for their hit points and Armor Class.
  const sheets = useSheetViews(characters)

  const [selectedCharacter, setSelectedCharacter] = useState<TurnCharacter | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Find the current actor: highest initiative, not complete
  const currentActorId = characters.find((c) => !c.isComplete)?.id

  // Find the player's character (AI companions carry the owner's userId)
  const playerCharacter = characters.find((c) => c.type === "pc" && c.userId === user?.id && !isAiControlledPc(c))

  const handleCharacterClick = (character: TurnCharacter) => {
    setSelectedCharacter(character)
    setModalOpen(true)
  }

  return (
    <>
      <div className="rounded-xl p-1">
        <ul className="flex flex-col gap-4">
          {characters.map((character, index) => {
            // Down: dead, dying or Stable.
            const isDead = isDown(character)
            const isPlayerCharacter = character.id === playerCharacter?.id
            const standing = standingOf(character, sheets[character.id])
            const conditions = conditionLabel(character)
            return (
              <li
                key={character.id}
                className={cn(
                  "enter-rise w-full max-w-[320px] 2xl:max-w-[360px] flex items-center gap-3 p-1.5 sm:p-2 relative rounded-xl transition-[scale,opacity,box-shadow] duration-200 ease-snap bg-gradient-to-tl ring ring-primary-700 cursor-pointer hover:ring-primary-500",
                  isDead ? "ring-zinc-700 from-zinc-800/50 via-zinc-800/50 to-zinc-700/50 opacity-60" : character.isComplete ? "ring-primary-600" : "from-primary-800 via-primary-800 to-primary-700",
                  character.id === currentActorId && !isDead ? "scale-100 shadow-md ring-primary-600 ring-2 from-primary-900" : "scale-90 from-primary-800/70 via-primary-800/70 opacity-90",
                  isDead && "opacity-50 scale-90" // Ensure dead characters are visually distinct
                )}
                style={{ "--i": Math.min(index, 8) } as CSSProperties}
              >
                <Button
                  variant="plain"
                  type="button"
                  aria-label={character.name}
                  onClick={() => handleCharacterClick(character)}
                  className="absolute inset-0 z-20 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                {character.image && <CharacterImage src={pictureAt(character.image, 48)} alt={character.name} />}
                <div className="z-10">
                  <div className="text-xs sm:text-sm font-bold font-display flex items-center gap-2">
                    {character.name}
                    <Presence show={Boolean(character.isComplete && !isDead)} motion="pop" asChild>
                      <CircleCheckBig className="absolute bottom-1.5 right-1.5 inline-block text-green-700 w-4 h-4 rounded-full bg-black ring-2 ring-black" />
                    </Presence>
                  </div>
                  {character.archetype !== "Monster" && (
                    <div className="text-3xs sm:text-xs font-display">
                      {character.gender} {character.race} {character.archetype}
                    </div>
                  )}

                  {standing && (
                    <div className="text-3xs sm:text-xs font-mono flex items-center gap-2 mt-0.5">
                      {standing.kind === "hero" ? (
                        <span className="text-primary-100">
                          {standing.hitPoints}/{standing.maximum} HP{standing.temporary ? ` +${standing.temporary} Temporary` : ""} · AC {standing.armorClass}
                        </span>
                      ) : (
                        <span style={{ color: standing.kind === "wound" ? WOUND_TONE[standing.word] : standing.kind === "stable" ? "var(--color-roll-success)" : WOUND_TONE.Dead }}>
                          {standingWords(standing).split(",")[0]}
                        </span>
                      )}
                      {standing.kind === "dying" && <DeathSaveMarks saves={standing} compact label={false} />}
                    </div>
                  )}
                  <Presence show={Boolean(conditions)} motion="fade" asChild>
                    <div className="text-3xs sm:text-xs italic text-accent-200/90">{conditions}</div>
                  </Presence>

                  {characters.length > 1 && !isDead && (
                    <div className="text-base flex items-center justify-center rounded-full bg-black ring ring-primary-600 w-8 h-8 font-mono absolute top-4 -left-5">{character.initiative}</div>
                  )}
                </div>
                <Presence show={Boolean(character.effects?.length)} motion="pop" asChild>
                  <div className="absolute top-2 right-8 z-10 bg-primary-100 text-primary-700 px-2 py-1 rounded text-xs">
                    {character.effects?.map((effect, idx) => (
                      <span key={idx} className="mr-2">
                        <span className="font-bold">{effect.name}</span> ({effect.duration})
                      </span>
                    ))}
                  </div>
                </Presence>

                {isPlayerCharacter && !isDead && (
                  <div className="text-3xs sm:text-xs text-accent-300/80 scale-x-110 tracking-wide font-bold font-mono px-1 py-0.5 bg-black rounded absolute -bottom-2.5 ring-2 ring-primary-600 right-8 z-10 scale-90">
                    YOU
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Show appropriate modal based on character type */}
      {selectedCharacter?.type === "pc" ? (
        <CharacterSheetModal
          character={currentTurn?.characters.find((c) => c.id === selectedCharacter.id) ?? selectedCharacter}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onOrders={
            currentTurn && !disableSSE && controlsHero(selectedCharacter, user?.id)
              ? (orders) =>
                  void setStandingOrders({ turnId: currentTurn.id as Id<"turns">, characterId: selectedCharacter.id, orders: orders as Record<string, string> }).catch((error) =>
                    console.error("[TurnCharacterList] The standing orders were not saved:", error)
                  )
              : undefined
          }
        />
      ) : (
        <NPCCharacterSheetModal character={selectedCharacter} open={modalOpen} onOpenChange={setModalOpen} />
      )}
    </>
  )
}
