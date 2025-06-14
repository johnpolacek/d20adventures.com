import React from "react"
import { Input } from "@/components/ui/input"
import { textShadow } from "../typography/styles"
import StepperButtons from "./stepper-buttons"

interface StepSpecialAbilitiesProps {
  hasSpecialAbilities: boolean | undefined
  onHasSpecialAbilitiesChange: (val: boolean) => void
  abilities: string[]
  onAbilitiesChange: (abilities: string[]) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepSpecialAbilities({ hasSpecialAbilities, onHasSpecialAbilitiesChange, abilities, onAbilitiesChange, onNext, onBack }: StepSpecialAbilitiesProps) {
  const handleAbilityChange = (idx: number, value: string) => {
    const updated = [...abilities]
    updated[idx] = value
    onAbilitiesChange(updated)
  }

  const handleAddAbility = () => {
    onAbilitiesChange([...abilities, ""])
  }

  const handleRemoveAbility = (idx: number) => {
    const updated = abilities.filter((_, i) => i !== idx)
    onAbilitiesChange(updated)
  }

  const nonBlankAbilities = abilities.filter((a) => a.trim() !== "")
  const canProceed = typeof hasSpecialAbilities === "boolean" && (!hasSpecialAbilities || nonBlankAbilities.length > 0)

  const handleNext = () => {
    if (hasSpecialAbilities) {
      onAbilitiesChange(nonBlankAbilities)
    }
    onNext()
  }

  return (
    <div className="w-full flex flex-col items-center gap-8">
      <h2 style={textShadow} className="text-lg italic text-center">
        Does your character have special abilities?
      </h2>
      <div className="flex gap-6 justify-center">
        <button
          type="button"
          className={`px-8 py-2 rounded font-bold transition-all ease-in-out duration-500 border border-amber-400 text-amber-300 ${hasSpecialAbilities === true ? "bg-amber-400 text-black border-transparent" : "bg-transparent hover:bg-amber-700/30 hover:scale-105"}`}
          onClick={() => onHasSpecialAbilitiesChange(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={`px-8 py-2 rounded font-bold transition-all ease-in-out duration-500 border border-amber-400 text-amber-300 ${hasSpecialAbilities === false ? "bg-amber-400 text-black border-transparent" : "bg-transparent hover:bg-amber-700/30 hover:scale-105"}`}
          onClick={() => onHasSpecialAbilitiesChange(false)}
        >
          No
        </button>
      </div>
      {hasSpecialAbilities && (
        <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
          {abilities.map((ability, idx) => (
            <div key={idx} className="flex w-full gap-2 items-center">
              <Input className="flex-1 bg-black/50" placeholder={`Ability #${idx + 1}`} value={ability} onChange={(e) => handleAbilityChange(idx, e.target.value)} />
              <button type="button" className="text-red-400 px-2" onClick={() => handleRemoveAbility(idx)} disabled={abilities.length === 1}>
                Remove
              </button>
            </div>
          ))}
          <div className="flex w-full justify-center">
            <button
              type="button"
              className="text-amber-300 border border-amber-400 hover:bg-amber-700/30 hover:scale-105 transition-all ease-in-out duration-500 rounded px-8 py-1 mt-2"
              onClick={handleAddAbility}
            >
              Add Ability
            </button>
          </div>
        </div>
      )}
      <StepperButtons onBack={onBack} onNext={handleNext} nextDisabled={!canProceed} />
    </div>
  )
}
