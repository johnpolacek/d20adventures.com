import { DeathSaveMarks } from "@/components/stage/roll-parts"
import { againstLabel } from "@/components/stage/roll-view"
import DiceRoll from "@/components/ui/dice-roll"
import Image from "@/components/ui/native-image"
import { cn, getImageUrl } from "@/lib/utils"
import type { RollRequirement } from "@/lib/validations/roll-requirement-schema"
import type { TurnCharacter } from "@/types/adventure"

export default function CharacterDiceRoll({
  rollRequired,
  rollResult,
  onRoll,
  className,
  inputKey,
  character,
  target,
}: {
  rollRequired: NonNullable<RollRequirement>
  rollResult: number | null
  onRoll: (result: number, second?: number) => void
  className?: string
  inputKey?: string | number
  character: TurnCharacter
  // An attack's or a spell attack's target, by name.
  target: string | undefined
}) {
  const { rollType, difficulty, modifier, mode, reasons } = rollRequired
  const kind = "attack" in rollRequired || "cast" in rollRequired ? "attack" : "deathSave" in rollRequired ? "death" : "check"
  const title = "cast" in rollRequired ? "Spell Attack" : "Dice Roll"
  // A Death Saving Throw shows no modifier unless it has one.
  const shownModifier = kind === "death" && modifier === 0 ? null : modifier

  return (
    <div className={cn("relative aspect-[2/3] sm:aspect-auto md:min-h-[300px] font-display font-bold border border-primary-700 rounded-xl overflow-hidden", className)}>
      <div className="absolute top-0 left-0 h-1/2 sm:h-full w-full sm:w-2/3 overflow-hidden">
        <Image className="object-cover" src={getImageUrl(character.image)} alt={character.name} fill={true} />
        <div className="absolute bottom-0 sm:bottom-auto sm:top-0 right-0 w-full sm:w-1/3 h-1/3 sm:h-full bg-gradient-to-t sm:bg-gradient-to-l from-black to-transparent" />
      </div>
      <div className="px-4 py-6 flex flex-col gap-4 text-center items-center justify-start w-full sm:w-1/2 absolute bottom-0 sm:relative sm:left-1/2">
        <h4 className="text-sm">
          {title} {rollResult === null ? "Needed" : ""}
        </h4>
        <h3 className="text-2xl text-amber-300">{rollType}</h3>
        {kind === "attack" && target && <div className="font-mono text-xs text-primary-100 -mt-3 uppercase tracking-wider">→ {target}</div>}
        <div className="font-mono text-xs text-primary-300 -mt-4 uppercase tracking-wider">
          {againstLabel(kind)} {difficulty}
          {shownModifier !== null && <span className={shownModifier < 0 ? "text-red-400" : "text-green-400"}>{shownModifier < 0 ? `  ${shownModifier}` : `  +${shownModifier}`}</span>}
        </div>
        {kind === "death" && <DeathSaveMarks saves={{ successes: character.deathSaves?.successes ?? 0, failures: character.deathSaves?.failures ?? 0 }} compact />}
        {mode !== "normal" && (
          <div className="font-mono text-xs text-amber-200 -mt-3 uppercase tracking-wider">
            {mode === "advantage" ? "Advantage" : "Disadvantage"}
            {reasons?.length ? <span className="block normal-case tracking-normal text-primary-300">{reasons.join(", ")}</span> : null}
          </div>
        )}
        <DiceRoll key={inputKey} className="my-2 scale-90 sm:scale-100" iconSize={48} id="d20-roll" dice={mode === "normal" ? 1 : 2} {...(rollResult === null ? { onRoll } : {})} />
      </div>
    </div>
  )
}
