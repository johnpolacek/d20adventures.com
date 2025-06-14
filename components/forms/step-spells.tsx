import React from "react"
import { Input } from "@/components/ui/input"
import { textShadow } from "../typography/styles"
import StepperButtons from "./stepper-buttons"

interface StepSpellsProps {
  hasSpells: boolean | undefined
  onHasSpellsChange: (val: boolean) => void
  spells: string[]
  onSpellsChange: (spells: string[]) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepSpells({ hasSpells, onHasSpellsChange, spells, onSpellsChange, onNext, onBack }: StepSpellsProps) {
  const handleSpellChange = (idx: number, value: string) => {
    const updated = [...spells]
    updated[idx] = value
    onSpellsChange(updated)
  }

  const handleAddSpell = () => {
    onSpellsChange([...spells, ""])
  }

  const handleRemoveSpell = (idx: number) => {
    const updated = spells.filter((_, i) => i !== idx)
    onSpellsChange(updated)
  }

  const nonBlankSpells = spells.filter((s) => s.trim() !== "")
  const canProceed = typeof hasSpells === "boolean" && (!hasSpells || nonBlankSpells.length > 0)

  const handleNext = () => {
    if (hasSpells) {
      onSpellsChange(nonBlankSpells)
    }
    onNext()
  }

  return (
    <div className="w-full flex flex-col items-center gap-8">
      <h2 style={textShadow} className="text-lg italic text-center">
        Does your character have spells?
      </h2>
      <div className="flex gap-6 justify-center">
        <button
          type="button"
          className={`px-8 py-2 rounded font-bold transition-all ease-in-out duration-500 border border-amber-400 text-amber-300 ${hasSpells === true ? "bg-amber-400 text-black border-transparent" : "bg-transparent hover:bg-amber-700/30 hover:scale-105"}`}
          onClick={() => onHasSpellsChange(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={`px-8 py-2 rounded font-bold transition-all ease-in-out duration-500 border border-amber-400 text-amber-300 ${hasSpells === false ? "bg-amber-400 text-black border-transparent" : "bg-transparent hover:bg-amber-700/30 hover:scale-105"}`}
          onClick={() => onHasSpellsChange(false)}
        >
          No
        </button>
      </div>
      {hasSpells && (
        <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
          {spells.map((spell, idx) => (
            <div key={idx} className="flex w-full gap-2 items-center">
              <Input className="flex-1 bg-black/50" placeholder={`Spell #${idx + 1}`} value={spell} onChange={(e) => handleSpellChange(idx, e.target.value)} />
              <button type="button" className="text-red-400 px-2" onClick={() => handleRemoveSpell(idx)} disabled={spells.length === 1}>
                Remove
              </button>
            </div>
          ))}
          <div className="flex w-full justify-center">
            <button
              type="button"
              className="text-amber-300 border border-amber-400 hover:bg-amber-700/30 hover:scale-105 transition-all ease-in-out duration-500 rounded px-8 py-1 mt-2"
              onClick={handleAddSpell}
            >
              Add Spell
            </button>
          </div>
        </div>
      )}
      <StepperButtons onBack={onBack} onNext={handleNext} nextDisabled={!canProceed} />
    </div>
  )
}
